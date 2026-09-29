import type { QuickFilter, SummaryCounts } from '../data/offers.ts';

export type StripSelection = QuickFilter | 'watchlist' | null;

interface Item {
  id: Exclude<StripSelection, null>;
  label: string;
  count: number;
}

export function SummaryStrip({
  counts,
  selected,
  onSelect,
}: {
  counts: SummaryCounts;
  selected: StripSelection;
  onSelect: (selection: StripSelection) => void;
}) {
  const items: Item[] = [
    { id: 'active', label: 'Active', count: counts.active },
    { id: 'expiring', label: 'Expiring ≤ 14 days', count: counts.expiring },
    { id: 'upcoming', label: 'Upcoming', count: counts.upcoming },
    { id: 'evergreen', label: 'Evergreen', count: counts.evergreen },
    { id: 'watchlist', label: 'Watch list', count: counts.watch },
    { id: 'new', label: 'New this week', count: counts.new },
  ];

  return (
    <nav className="summary-strip" aria-label="Summary filters">
      <ul>
        {items.map((item) => {
          const pressed = selected === item.id;
          return (
            <li key={item.id}>
              <button
                type="button"
                aria-pressed={pressed}
                onClick={() => {
                  onSelect(pressed ? null : item.id);
                }}
              >
                <span className="count">{item.count}</span>{' '}
                <span className="label">{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
