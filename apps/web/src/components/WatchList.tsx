import { useMemo } from 'react';

import { Button } from 'primereact/button';
import { Card } from 'primereact/card';

import { watchListOrder, type OfferRow } from '../data/offers.ts';
import { formatDate } from '../lib/format.ts';
import { StatusTag } from './Tags.tsx';

export function WatchList({
  rows,
  onReveal,
}: {
  rows: OfferRow[];
  onReveal: (offerId: string) => void;
}) {
  const items = useMemo(() => rows.filter((row) => row.watch).sort(watchListOrder), [rows]);

  if (items.length === 0) {
    return <p className="empty-state">Nothing to watch right now.</p>;
  }

  return (
    <ul className="watch-grid" aria-label="Watch list">
      {items.map((row) => (
        <li key={row.id}>
          <Card title={row.name} subTitle={row.vendor}>
            <p>
              <StatusTag status={row.derivedStatus} />
            </p>
            <p>
              {row.recurring.expectedNextWindow ??
                (row.derivedStatus === 'unverified'
                  ? 'Source page changed or could not be reached; needs a manual check.'
                  : 'Next window not announced yet.')}
            </p>
            {row.recurring.expectedNextWindowDate !== null && (
              <p className="offer-vendor">
                Expected around {formatDate(row.recurring.expectedNextWindowDate)}
              </p>
            )}
            <div className="card-actions">
              <a
                className="p-button p-button-outlined p-button-sm"
                href={row.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="pi pi-external-link u-mr-2" aria-hidden="true" />
                Verify at source
              </a>
              <Button
                label="Show in offers"
                icon="pi pi-list"
                text
                size="small"
                onClick={() => {
                  onReveal(row.id);
                }}
              />
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
