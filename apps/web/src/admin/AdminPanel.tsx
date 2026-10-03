import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from 'primereact/button';

import { costToYouOf, type Candidate } from '@cert-tracker/core';

import { useAnnouncer } from '../a11y/announcerContext.ts';
import { CostTag, Mark } from '../components/Tags.tsx';
import { relativeTime, windowLabel } from '../lib/format.ts';
import { ELIGIBILITY_TAGS, WHAT_IS_FREE_TAGS, type Tone } from '../lib/labels.ts';
import { useAdmin } from './adminContext.ts';
import { AdminApiError, createAdminApi, type Decision } from './api.ts';

type Queue =
  | { kind: 'loading' }
  | { kind: 'failed'; message: string }
  | { kind: 'ready'; candidates: Candidate[] };

const CONFIDENCE: Record<Candidate['confidence'], { label: string; icon: string; tone: Tone }> = {
  high: { label: 'High confidence', icon: 'pi pi-arrow-up', tone: 'accent' },
  medium: { label: 'Medium confidence', icon: 'pi pi-minus', tone: 'ink' },
  low: { label: 'Low confidence', icon: 'pi pi-arrow-down', tone: 'deadline' },
};

function CandidateCard({
  candidate,
  busy,
  onDecide,
}: {
  candidate: Candidate;
  busy: boolean;
  onDecide: (candidate: Candidate, decision: Decision) => void;
}) {
  const confidence = CONFIDENCE[candidate.confidence];
  const free = WHAT_IS_FREE_TAGS[candidate.whatIsFree];
  const headingId = `candidate-${candidate.candidateId}`;
  const updatesExisting = candidate.matchesExistingId !== null;

  return (
    <li className="panel candidate" aria-labelledby={headingId}>
      <div className="panel-head">
        <div>
          <h3 id={headingId} className="candidate-name">
            {candidate.name}
          </h3>
          <p className="muted candidate-meta">
            {candidate.vendor} · found {relativeTime(candidate.createdAt)}
          </p>
        </div>
        <Mark icon={confidence.icon} tone={confidence.tone} strong>
          {confidence.label}
        </Mark>
      </div>

      <dl className="candidate-facts">
        <div>
          <dt>Free</dt>
          <dd>
            {free.label}
            {candidate.cost !== null && ` · ${candidate.cost}`}
          </dd>
        </div>
        <div>
          <dt>Cost to you</dt>
          <dd>
            <CostTag value={costToYouOf(candidate)} detail={candidate.cost} />
          </dd>
        </div>
        <div>
          <dt>Window</dt>
          <dd>{windowLabel(candidate.windowStart, candidate.windowEnd)}</dd>
        </div>
        <div>
          <dt>Open to</dt>
          <dd>{candidate.eligibility.map((who) => ELIGIBILITY_TAGS[who].label).join(', ')}</dd>
        </div>
        {candidate.certifications.length > 0 && (
          <div>
            <dt>Credentials</dt>
            <dd>{candidate.certifications.join(', ')}</dd>
          </div>
        )}
      </dl>

      {candidate.requirements !== '' && <p className="candidate-text">{candidate.requirements}</p>}
      <p className="candidate-text candidate-rationale">
        <span className="muted">Why the model thinks so:</span> {candidate.llmRationale}
      </p>

      {/* the links are the point: nothing here should be approved without opening the source */}
      <p className="candidate-links">
        <a href={candidate.url} target="_blank" rel="noreferrer noopener">
          Offer page
        </a>
        <a href={candidate.sourceUrl} target="_blank" rel="noreferrer noopener">
          Source checked
        </a>
      </p>

      {updatesExisting && (
        <p className="callout callout--warning" role="note">
          <span className="pi pi-exclamation-circle" aria-hidden="true" />
          {/* one child, so the callout's flex row doesn't split the sentence into columns */}
          <span>
            Looks like an update to <span className="mono">{candidate.matchesExistingId}</span>.
            Merging isn&apos;t built yet, so this one can only be dismissed.
          </span>
        </p>
      )}

      <div className="candidate-actions">
        <Button
          label="Dismiss"
          outlined
          size="small"
          disabled={busy}
          onClick={() => {
            onDecide(candidate, 'dismiss');
          }}
        />
        <Button
          label="Approve"
          icon="pi pi-check"
          size="small"
          disabled={busy || updatesExisting}
          onClick={() => {
            onDecide(candidate, 'approve');
          }}
        />
      </div>
    </li>
  );
}

export default function AdminPanel({ onLeave }: { onLeave: () => void }) {
  const { token, config, leave, signOut } = useAdmin();
  const { announce } = useAnnouncer();
  const [queue, setQueue] = useState<Queue>({ kind: 'loading' });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const api = useMemo(
    () => (config !== null && token !== null ? createAdminApi(config, token) : null),
    [config, token],
  );

  // a refused token ends admin mode; anything else is reported and left for a retry
  const describe = useCallback(
    (error: unknown): string => {
      if (error instanceof AdminApiError && error.signedOut) {
        leave();
        onLeave();
        announce('The admin session ended. Sign in again to continue.');
      }
      return error instanceof Error ? error.message : 'Something went wrong.';
    },
    [leave, onLeave, announce],
  );

  // bumped to read the queue again: the Refresh button, and a 409 that says it has moved on
  const [reads, setReads] = useState(0);
  useEffect(() => {
    if (api === null) return;
    let stale = false;
    api.listCandidates().then(
      (candidates) => {
        if (!stale) setQueue({ kind: 'ready', candidates });
      },
      (error: unknown) => {
        if (!stale) setQueue({ kind: 'failed', message: describe(error) });
      },
    );
    return () => {
      stale = true;
    };
  }, [api, describe, reads]);

  const decide = (candidate: Candidate, decision: Decision): void => {
    if (api === null) return;
    setBusyId(candidate.candidateId);
    setActionError(null);
    api
      .decide(candidate.candidateId, decision)
      .then(() => {
        setQueue((current) =>
          current.kind === 'ready'
            ? {
                kind: 'ready',
                candidates: current.candidates.filter(
                  (other) => other.candidateId !== candidate.candidateId,
                ),
              }
            : current,
        );
        announce(
          decision === 'approve'
            ? `${candidate.name} approved. It goes live with the next publish.`
            : `${candidate.name} dismissed.`,
        );
      })
      .catch((error: unknown) => {
        setActionError(`${candidate.name}: ${describe(error)}`);
        // a 409 means the queue on screen is stale; show what is really there
        if (error instanceof AdminApiError && error.status === 409) setReads((n) => n + 1);
      })
      .finally(() => {
        setBusyId(null);
      });
  };

  return (
    <section aria-labelledby="review-heading" className="review">
      <div className="admin-bar">
        <span className="admin-badge">Admin mode</span>
        <span className="muted">API</span>
        <code className="mono admin-bar-url">{config?.apiBaseUrl ?? 'not configured'}</code>
        <span className="admin-bar-spacer" />
        <Button
          label="Sign out"
          outlined
          size="small"
          onClick={() => {
            onLeave();
            signOut();
          }}
        />
      </div>
      <div className="review-panel">
        <div className="panel-head">
          <div>
            <h2 id="review-heading" className="section-title">
              Review{' '}
              {queue.kind === 'ready' && (
                <span className="section-count">· {queue.candidates.length}</span>
              )}
            </h2>
            <p className="section-lede">
              Offers the pipeline found and could not accept on its own. Approving publishes one;
              dismissing drops it.
            </p>
          </div>
          <Button
            label="Refresh"
            icon="pi pi-refresh"
            text
            size="small"
            onClick={() => {
              setQueue({ kind: 'loading' });
              setReads((n) => n + 1);
            }}
          />
        </div>

        {actionError !== null && (
          <p className="callout callout--warning" role="alert">
            <span className="pi pi-exclamation-circle" aria-hidden="true" /> {actionError}
          </p>
        )}
        {queue.kind === 'loading' && <p className="empty-state">Loading the queue…</p>}
        {queue.kind === 'failed' && (
          <p className="callout callout--warning" role="alert">
            <span className="pi pi-exclamation-circle" aria-hidden="true" /> {queue.message}
          </p>
        )}
        {queue.kind === 'ready' && queue.candidates.length === 0 && (
          <p className="empty-state">Nothing is waiting for review.</p>
        )}
        {queue.kind === 'ready' && queue.candidates.length > 0 && (
          <ul className="candidate-list">
            {queue.candidates.map((candidate) => (
              <CandidateCard
                key={candidate.candidateId}
                candidate={candidate}
                busy={busyId !== null}
                onDecide={decide}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
