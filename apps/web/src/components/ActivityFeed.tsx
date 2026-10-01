import { Fragment, useMemo, useState } from 'react';

import { localIsoDate, type SnapshotEvent } from '@cert-tracker/core';

import { groupByDay, rotateLastVisit } from '../data/activity.ts';
import { dayLabel, formatDate, formatTime, formatWeekday, plural } from '../lib/format.ts';
import { EVENT_LABELS } from '../lib/labels.ts';
import { Segmented } from './Segmented.tsx';

type Scope = 'all' | 'offers' | 'system';

function eventName(event: SnapshotEvent): string {
  const name = event.payload.name;
  return typeof name === 'string' ? name : (event.offerId ?? 'an offer');
}

function isOfferEvent(event: SnapshotEvent): boolean {
  return event.offerId !== undefined;
}

export function ActivityFeed({
  events,
  onReveal,
}: {
  events: SnapshotEvent[];
  onReveal: (offerId: string) => void;
}) {
  const [lastVisit] = useState(rotateLastVisit);
  const [scope, setScope] = useState<Scope>('all');
  const today = localIsoDate();
  const scoped = useMemo(
    () =>
      events.filter((event) =>
        scope === 'all' ? true : scope === 'offers' ? isOfferEvent(event) : !isOfferEvent(event),
      ),
    [events, scope],
  );
  const groups = useMemo(() => groupByDay(scoped, lastVisit), [scoped, lastVisit]);
  const fresh =
    lastVisit === null
      ? events.length
      : events.filter((event) => event.occurredAt > lastVisit).length;

  if (events.length === 0) {
    return <p className="empty-state">No activity recorded yet.</p>;
  }

  return (
    <section className="activity" aria-labelledby="activity-heading">
      <div className="panel-head">
        <h2 id="activity-heading" className="section-title">
          What changed{' '}
          <span className="section-count">
            ·{' '}
            {lastVisit === null
              ? plural(events.length, 'event')
              : `${plural(fresh, 'event')} since your last visit`}
          </span>
        </h2>
        <Segmented
          label="Activity scope"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'all', label: 'All' },
            { value: 'offers', label: 'Offers' },
            { value: 'system', label: 'System' },
          ]}
        />
      </div>
      {groups.length === 0 ? (
        <p className="empty-state">Nothing in this view.</p>
      ) : (
        <div className="panel activity-panel">
          {groups.map((group) => (
            <Fragment key={group.day}>
              {group.dividerBefore && (
                <p className="activity-divider">
                  <span className="group-rule" aria-hidden="true" />
                  <span>
                    Seen on your last visit
                    {lastVisit !== null && ` · ${formatDate(lastVisit.slice(0, 10))}`} · and earlier
                  </span>
                  <span className="group-rule" aria-hidden="true" />
                </p>
              )}
              <section className="activity-day" aria-labelledby={`day-${group.day}`}>
                <div className="activity-date">
                  <h3 id={`day-${group.day}`}>{dayLabel(group.day, today)}</h3>
                  <span className="mono eyebrow">{formatWeekday(group.day)}</span>
                </div>
                <ol className="activity-events">
                  {group.events.map((event, index) => {
                    const spec = EVENT_LABELS[event.type];
                    const offer = isOfferEvent(event);
                    return (
                      <li
                        key={`${event.occurredAt}-${String(index)}`}
                        className={`activity-event${offer ? '' : ' activity-event--system'}`}
                      >
                        <span className={`activity-marker activity-marker--${spec.tone}`}>
                          <span className={spec.icon} aria-hidden="true" />
                        </span>
                        <span className="activity-text">
                          <span className={`activity-type mark--${spec.tone}`}>{spec.label}</span>
                          <span className="muted"> · </span>
                          {eventName(event)}
                        </span>
                        <span className="activity-side">
                          <time dateTime={event.occurredAt} className="mono muted">
                            {formatTime(event.occurredAt)}
                          </time>
                          {offer && (
                            <button
                              type="button"
                              className="text-link"
                              onClick={() => {
                                onReveal(event.offerId ?? '');
                              }}
                            >
                              Show in offers{' '}
                              <span className="pi pi-arrow-right" aria-hidden="true" />
                            </button>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </section>
            </Fragment>
          ))}
        </div>
      )}
    </section>
  );
}
