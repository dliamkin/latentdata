import { useMemo, useState } from 'react';

import { localIsoDate } from '@cert-tracker/core';

import { watchListOrder, type OfferRow } from '../data/offers.ts';
import { formatDate, plural, relativeTime } from '../lib/format.ts';
import { VendorMark } from './VendorMark.tsx';
import { Segmented } from './Segmented.tsx';
import { StatusTag } from './Tags.tsx';

type Scope = 'all' | 'recurring' | 'unverified';

interface Group {
  key: string;
  label: string;
  tone: 'upcoming' | 'muted' | 'deadline';
  items: OfferRow[];
}

const QUARTERS = ['Jan – Mar', 'Apr – Jun', 'Jul – Sep', 'Oct – Dec'] as const;

// cards fall into buckets by when to come back: quarters of the current year, then whole
// years, then "not announced"; offers that need a manual check go last whatever their date
function groupKey(row: OfferRow, thisYear: string): { key: string; label: string } {
  const date = row.recurring.expectedNextWindowDate;
  if (row.derivedStatus === 'unverified') return { key: 'z-check', label: 'Needs a manual check' };
  if (date === null) return { key: 'y-none', label: 'Next window not announced' };
  const year = date.slice(0, 4);
  if (year !== thisYear) return { key: `b-${year}`, label: `Expected next · ${year}` };
  const quarter = Math.floor((Number(date.slice(5, 7)) - 1) / 3);
  return {
    key: `a-${String(quarter)}`,
    label: `Expected next · ${QUARTERS[quarter] ?? ''} ${year}`,
  };
}

function groupTone(key: string): Group['tone'] {
  if (key === 'z-check') return 'deadline';
  if (key === 'y-none') return 'muted';
  return 'upcoming';
}

function description(row: OfferRow): string {
  if (row.recurring.expectedNextWindow !== null) return row.recurring.expectedNextWindow;
  if (row.derivedStatus === 'unverified') {
    return row.verificationNote !== ''
      ? row.verificationNote
      : 'Source page changed or could not be reached; needs a manual check.';
  }
  return 'Next window not announced yet.';
}

export function WatchList({
  rows,
  onReveal,
}: {
  rows: OfferRow[];
  onReveal: (offerId: string) => void;
}) {
  const [scope, setScope] = useState<Scope>('all');
  const items = useMemo(() => rows.filter((row) => row.watch).sort(watchListOrder), [rows]);
  const unverified = items.filter((row) => row.derivedStatus === 'unverified').length;
  const scoped = items.filter((row) =>
    scope === 'all'
      ? true
      : scope === 'unverified'
        ? row.derivedStatus === 'unverified'
        : row.derivedStatus !== 'unverified',
  );

  const groups = useMemo((): Group[] => {
    const thisYear = localIsoDate().slice(0, 4);
    const byKey = new Map<string, Group>();
    for (const row of scoped) {
      const { key, label } = groupKey(row, thisYear);
      const group = byKey.get(key) ?? { key, label, tone: groupTone(key), items: [] };
      group.items.push(row);
      byKey.set(key, group);
    }
    return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
  }, [scoped]);

  if (items.length === 0) {
    return <p className="empty-state">Nothing to watch right now.</p>;
  }

  return (
    <section className="watch" aria-labelledby="watch-heading">
      <div className="panel-head">
        <div>
          <h2 id="watch-heading" className="section-title">
            To keep an eye on <span className="section-count">· {items.length}</span>
          </h2>
          <p className="section-lede">
            Recurring promotions that are currently closed or not yet open, plus offers whose source
            page we couldn&apos;t confirm. Sorted by expected next date.
          </p>
        </div>
        <Segmented
          label="Watch list scope"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'all', label: 'All', count: items.length },
            { value: 'recurring', label: 'Recurring', count: items.length - unverified },
            { value: 'unverified', label: 'Unverified', count: unverified },
          ]}
        />
      </div>
      {groups.map((group) => (
        <section key={group.key} className="watch-group" aria-label={group.label}>
          <h3 className={`group-label group-label--${group.tone}`}>
            <span>
              {group.label} · {group.items.length}
            </span>
            <span className="group-rule" aria-hidden="true" />
          </h3>
          <ul className="watch-grid">
            {group.items.map((row) => (
              <li key={row.id} className="watch-card">
                <div className="watch-card-top">
                  <StatusTag status={row.derivedStatus} />
                  <span className="mono muted">
                    {row.derivedStatus === 'unverified'
                      ? `checked ${relativeTime(row.lastVerified)}`
                      : row.recurring.expectedNextWindowDate !== null
                        ? `~ ${formatDate(row.recurring.expectedNextWindowDate)}`
                        : ''}
                  </span>
                </div>
                <div className="offer-cell">
                  <VendorMark vendor={row.vendor} />
                  <div className="offer-name">
                    <span className="offer-title">{row.name}</span>
                    <span className="offer-meta">
                      {row.vendor} · {plural(row.certifications.length, 'certification')}
                    </span>
                  </div>
                </div>
                <p className="watch-card-text">{description(row)}</p>
                <div className="watch-card-foot">
                  <a
                    className="p-button p-component p-button-outlined p-button-sm"
                    href={row.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Verify at source <span className="pi pi-external-link" aria-hidden="true" />
                  </a>
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => {
                      onReveal(row.id);
                    }}
                  >
                    Show in offers <span className="pi pi-arrow-right" aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}
