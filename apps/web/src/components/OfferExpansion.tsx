import { useEffect, useId, useRef, useState } from 'react';

import { InputTextarea } from 'primereact/inputtextarea';

import { useAnnouncer } from '../a11y/announcerContext.ts';
import type { OfferRow } from '../data/offers.ts';
import { formatDate } from '../lib/format.ts';
import { useTracking } from '../tracking/trackingContext.ts';

const SAVE_DELAY_MS = 600;

function recurringText(row: OfferRow): string {
  if (!row.recurring.isRecurring) return 'One-off';
  const parts = [row.recurring.cadence, row.recurring.expectedNextWindow].filter(
    (p): p is string => p !== null && p !== '',
  );
  return parts.length > 0 ? parts.join(' · ') : 'Recurring, cadence unknown';
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
      <dl className="offer-details">
        <dt>Certifications</dt>
        <dd>{row.certifications.join(', ')}</dd>
        <dt>Exam code</dt>
        <dd>{row.examCode ?? 'Not specified'}</dd>
        {row.cost !== null && (
          <>
            <dt>Cost</dt>
            <dd>{row.cost}</dd>
          </>
        )}
        <dt>Regions</dt>
        <dd>{row.regions}</dd>
        <dt>Requirements</dt>
        <dd>{row.requirements}</dd>
        <dt>Recurring</dt>
        <dd>{recurringText(row)}</dd>
        <dt>Verified</dt>
        <dd>
          <a href={row.sourceUrl} target="_blank" rel="noopener noreferrer">
            Source page
          </a>{' '}
          on {formatDate(row.lastVerified)}
          {row.verificationNote !== '' && ` · ${row.verificationNote}`}
        </dd>
        {row.notes !== '' && (
          <>
            <dt>Notes</dt>
            <dd>{row.notes}</dd>
          </>
        )}
      </dl>
      <div className="tracking-notes">
        <label htmlFor={notesId}>My notes</label>
        <InputTextarea
          id={notesId}
          value={draft}
          rows={3}
          autoResize
          aria-describedby={helpId}
          onChange={(event) => {
            onNotesChange(event.target.value);
          }}
        />
        <small id={helpId}>Saved automatically, in this browser only.</small>
      </div>
    </div>
  );
}
