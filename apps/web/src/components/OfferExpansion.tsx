import { useEffect, useId, useRef, useState } from 'react';

import { InputTextarea } from 'primereact/inputtextarea';

import { useAnnouncer } from '../a11y/announcerContext.ts';
import type { OfferRow } from '../data/offers.ts';
import { formatDate, plural } from '../lib/format.ts';
import { STATUS_TAGS, WHAT_IS_FREE_TAGS, countdownLabel } from '../lib/labels.ts';
import { useTracking } from '../tracking/trackingContext.ts';
import { WindowBar } from './WindowBar.tsx';

const SAVE_DELAY_MS = 600;

function recurringText(row: OfferRow): string {
  if (!row.recurring.isRecurring) return 'One-off';
  const parts = [row.recurring.cadence, row.recurring.expectedNextWindow].filter(
    (p): p is string => p !== null && p !== '',
  );
  return parts.length > 0 ? parts.join(' · ') : 'Recurring, cadence unknown';
}

interface Fact {
  label: string;
  value: string;
  note: string;
  mono?: boolean;
  deadline?: boolean;
}

// the three things a reader decides on: what it costs, when it ends, which exam it is
function facts(row: OfferRow): Fact[] {
  const deadline: Fact =
    row.windowEnd !== null
      ? {
          label: 'Deadline',
          value: formatDate(row.windowEnd),
          note:
            row.derivedStatus === 'active' && row.expiringSoon && row.daysLeft !== null
              ? countdownLabel(row.daysLeft)
              : row.derivedStatus === 'upcoming' && row.windowStart !== null
                ? `Opens ${formatDate(row.windowStart)}`
                : STATUS_TAGS[row.derivedStatus].label,
          deadline: row.derivedStatus === 'active' && row.expiringSoon,
        }
      : row.windowStart !== null
        ? { label: 'Opens', value: formatDate(row.windowStart), note: 'No end date announced' }
        : { label: 'Deadline', value: 'None', note: 'Available until withdrawn' };
  return [
    {
      label: 'Cost',
      value: row.cost ?? (row.whatIsFree === 'full-exam' ? 'Free' : 'Not specified'),
      note: WHAT_IS_FREE_TAGS[row.whatIsFree].label,
    },
    deadline,
    {
      label: row.examCode?.includes('/') === true ? 'Exam codes' : 'Exam code',
      value: row.examCode ?? 'Not specified',
      note: plural(row.certifications.length, 'certification'),
      mono: true,
    },
  ];
}

export function OfferExpansion({ row }: { row: OfferRow }) {
  const { entries, setNotes } = useTracking();
  const { announce } = useAnnouncer();
  const notesId = useId();
  const helpId = useId();
  const [draft, setDraft] = useState(entries[row.id]?.notes ?? '');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  // the ?offer= deep link, so a row can be shared without the tab or filters
  const copyLink = async (): Promise<void> => {
    const url = new URL(window.location.origin);
    url.searchParams.set('offer', row.id);
    try {
      await navigator.clipboard.writeText(url.toString());
      announce('Link copied');
    } catch {
      announce('Could not copy the link');
    }
  };

  const onNotesChange = (value: string): void => {
    setDraft(value);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setNotes(row.id, value);
      announce('Saved');
    }, SAVE_DELAY_MS);
  };

  return (
    <div className="offer-expansion" role="region" aria-label={`Details for ${row.name}`}>
      <div className="offer-facts-column">
        <dl className="fact-cards">
          {facts(row).map((fact) => (
            <div
              key={fact.label}
              className={`fact-card${fact.deadline === true ? ' fact-card--deadline' : ''}`}
            >
              <dt>{fact.label}</dt>
              <dd>
                <span className={`fact-value${fact.mono === true ? ' mono' : ''}`}>
                  {fact.value}
                </span>
                <span className="fact-note">{fact.note}</span>
                {fact.deadline === true && row.windowProgress !== null && (
                  <WindowBar progress={row.windowProgress} daysLeft={row.daysLeft} />
                )}
              </dd>
            </div>
          ))}
        </dl>
        <dl className="offer-details">
          <dt>Requirements</dt>
          <dd>{row.requirements}</dd>
          <dt>Certifications</dt>
          <dd>{row.certifications.join(' · ')}</dd>
          <dt>Regions</dt>
          <dd>{row.regions}</dd>
          <dt>Recurring</dt>
          <dd>{recurringText(row)}</dd>
          <dt>Verified</dt>
          <dd>
            <a className="text-link" href={row.sourceUrl} target="_blank" rel="noopener noreferrer">
              Source page <span className="pi pi-external-link" aria-hidden="true" />
            </a>{' '}
            · {formatDate(row.lastVerified)}
            {row.verificationNote !== '' && ` · ${row.verificationNote}`}
          </dd>
          {row.notes !== '' && (
            <>
              <dt>Notes</dt>
              <dd>{row.notes}</dd>
            </>
          )}
        </dl>
      </div>
      <div className="tracking-notes">
        <label htmlFor={notesId} className="eyebrow">
          My notes
        </label>
        <InputTextarea
          id={notesId}
          value={draft}
          rows={5}
          autoResize
          aria-describedby={helpId}
          onChange={(event) => {
            onNotesChange(event.target.value);
          }}
        />
        <small id={helpId}>Saved automatically, in this browser only.</small>
        <button
          type="button"
          className="text-link copy-link"
          title="Copies a link that opens straight to this offer"
          onClick={() => {
            void copyLink();
          }}
        >
          <span className="pi pi-link" aria-hidden="true" /> Copy link to this offer
        </button>
      </div>
    </div>
  );
}
