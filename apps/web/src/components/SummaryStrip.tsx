import type { Track } from '@cert-tracker/core';

import type { QuickFilter, SummaryCounts } from '../data/offers.ts';
import { TRACK_TAGS } from '../lib/labels.ts';
import { Segmented } from './Segmented.tsx';

export type StripSelection = QuickFilter | 'watchlist' | null;

interface Item {
  id: Exclude<StripSelection, null>;
  label: string;
  icon: string;
  count: number;
  // the numeral takes the status colour; the deadline bucket is the only one that does
  tone?: 'deadline';
  // the Watch list cell is a jump, not a filter, and says so with an arrow
  jump?: boolean;
  hint: string;
}

export interface AudienceCounts {
  all: number;
  software: number;
  it: number;
}

export function SummaryStrip({
  counts,
  selected,
  onSelect,
  audience,
  audienceCounts,
  onAudience,
}: {
  counts: SummaryCounts;
  selected: StripSelection;
  onSelect: (selection: StripSelection) => void;
  audience: Track | null;
  audienceCounts: AudienceCounts;
  onAudience: (audience: Track | null) => void;
}) {
  const items: Item[] = [
    {
      id: 'active',
      label: 'Active',
      icon: 'pi pi-check-circle',
      count: counts.active,
      hint: 'Show only offers open right now',
    },
    {
      id: 'expiring',
      label: 'Ends ≤ 14 days',
      icon: 'pi pi-clock',
      count: counts.expiring,
      tone: 'deadline',
      hint: 'Show only offers ending within two weeks',
    },
    {
      id: 'upcoming',
      label: 'Upcoming',
      icon: 'pi pi-play-circle',
      count: counts.upcoming,
      hint: 'Show only offers that have not opened yet',
    },
    {
      id: 'evergreen',
      label: 'Evergreen',
      icon: 'pi pi-sync',
      count: counts.evergreen,
      hint: 'Show only offers with no end date',
    },
    {
      id: 'watchlist',
      label: 'Watch list',
      icon: 'pi pi-eye',
      count: counts.watch,
      jump: true,
      hint: 'Open the watch list',
    },
    {
      id: 'new',
      label: 'New this week',
      icon: 'pi pi-plus-circle',
      count: counts.new,
      hint: 'Show only offers found in the last 7 days',
    },
  ];

  return (
    <div className="summary-row">
      <div className="summary-lens">
        <Segmented
          label="Who the offers are for"
          value={audience ?? 'all'}
          onChange={(value) => {
            onAudience(value === 'all' ? null : value);
          }}
          options={[
            { value: 'all', label: 'Everything', count: audienceCounts.all },
            {
              value: 'software',
              label: TRACK_TAGS.software.label,
              count: audienceCounts.software,
            },
            { value: 'it', label: TRACK_TAGS.it.label, count: audienceCounts.it },
          ]}
        />
      </div>
      <nav className="summary-strip" aria-label="Summary filters">
        <ul>
          {items.map((item) => {
            const pressed = selected === item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  aria-pressed={pressed}
                  title={pressed ? 'Clear this filter' : item.hint}
                  className={item.tone === undefined ? undefined : `strip--${item.tone}`}
                  onClick={() => {
                    onSelect(pressed ? null : item.id);
                  }}
                >
                  <span className="count">{item.count}</span>{' '}
                  <span className="label">
                    <span className={item.icon} aria-hidden="true" /> {item.label}
                    {item.jump === true && (
                      <span className="pi pi-arrow-right strip-arrow" aria-hidden="true" />
                    )}
                    {pressed && <span className="strip-clear" aria-hidden="true" />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
