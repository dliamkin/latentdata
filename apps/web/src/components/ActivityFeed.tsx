import { Fragment, useMemo, useState } from 'react';

import { Button } from 'primereact/button';
import { Timeline } from 'primereact/timeline';

import type { SnapshotEvent } from '@cert-tracker/core';

import { groupByDay, rotateLastVisit } from '../data/activity.ts';
import { formatDate, formatDateTime } from '../lib/format.ts';
import { EVENT_LABELS } from '../lib/labels.ts';

function eventName(event: SnapshotEvent): string {
  const name = event.payload.name;
  return typeof name === 'string' ? name : (event.offerId ?? 'an offer');
}

export function ActivityFeed({
  events,
  onReveal,
}: {
  events: SnapshotEvent[];
  onReveal: (offerId: string) => void;
}) {
  const [lastVisit] = useState(rotateLastVisit);
  const groups = useMemo(() => groupByDay(events, lastVisit), [events, lastVisit]);

  if (groups.length === 0) {
    return <p className="empty-state">No activity recorded yet.</p>;
  }

  return (
    <div>
      {groups.map((group) => (
        <Fragment key={group.day}>
          {group.dividerBefore && (
            <p className="activity-divider">Seen on your last visit and earlier</p>
          )}
          <h2 className="activity-day">{formatDate(group.day)}</h2>
          <Timeline
            value={group.events}
            marker={(event: SnapshotEvent) => (
              <span
                className={`${EVENT_LABELS[event.type].icon} activity-marker`}
                aria-hidden="true"
              />
            )}
            content={(event: SnapshotEvent) => (
              <div className="activity-event">
                <span>
                  <strong>{EVENT_LABELS[event.type].label}</strong>: {eventName(event)}
                </span>
                <time dateTime={event.occurredAt}>{formatDateTime(event.occurredAt)}</time>
                {event.offerId !== undefined && (
                  <span>
                    <Button
                      label="Show in offers"
                      icon="pi pi-list"
                      text
                      size="small"
                      onClick={() => {
                        onReveal(event.offerId ?? '');
                      }}
                    />
                  </span>
                )}
              </div>
            )}
          />
        </Fragment>
      ))}
    </div>
  );
}
