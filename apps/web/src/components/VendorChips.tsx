import { useState } from 'react';

import { plural } from '../lib/format.ts';
import { VendorMark } from './VendorMark.tsx';

// how many chips show before the "more" button; the tail is long (most vendors have one offer)
const VISIBLE = 8;

export interface VendorChipsProps {
  // every vendor in the rows the table would show without a vendor filter, busiest first
  counts: readonly { vendor: string; count: number }[];
  selected: readonly string[];
  onToggle: (vendor: string) => void;
  onClear: () => void;
}

export function VendorChips({ counts, selected, onToggle, onClear }: VendorChipsProps) {
  const [expanded, setExpanded] = useState(false);
  // a chosen vendor always has a chip, even when it sits in the hidden tail
  const shown = expanded
    ? counts
    : counts.filter((item, index) => index < VISIBLE || selected.includes(item.vendor));
  const hidden = counts.length - shown.length;

  if (counts.length < 2) return null;

  return (
    <div className="vendor-chips" role="group" aria-label="Filter by vendor">
      <button
        type="button"
        className="chip chip--all"
        aria-pressed={selected.length === 0}
        title="Show every vendor"
        onClick={onClear}
      >
        All vendors
      </button>
      {shown.map(({ vendor, count }) => {
        const pressed = selected.includes(vendor);
        return (
          <button
            key={vendor}
            type="button"
            className="chip"
            aria-pressed={pressed}
            title={
              pressed
                ? `Stop filtering by ${vendor}`
                : `Show only ${vendor} (${plural(count, 'offer')})`
            }
            onClick={() => {
              onToggle(vendor);
            }}
          >
            <VendorMark vendor={vendor} />
            <span className="chip-label">{vendor}</span>
            <span className="chip-count">{count}</span>
          </button>
        );
      })}
      {(hidden > 0 || expanded) && (
        <button
          type="button"
          className="chip chip--more"
          aria-expanded={expanded}
          onClick={() => {
            setExpanded((current) => !current);
          }}
        >
          {expanded ? 'Show fewer' : `+${String(hidden)} more`}
        </button>
      )}
    </div>
  );
}
