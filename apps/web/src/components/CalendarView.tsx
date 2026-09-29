import { useMemo, useState } from 'react';

import { Button } from 'primereact/button';
import { Calendar, type CalendarDateTemplateEvent } from 'primereact/calendar';

import { localIsoDate } from '@cert-tracker/core';

import { offersOnDay, type OfferRow } from '../data/offers.ts';
import { formatDate, plural, windowLabel } from '../lib/format.ts';
import { StatusTag } from './Tags.tsx';

const MAX_DOTS = 3;

interface DayMeta {
  day: number;
  month: number;
  year: number;
}

function isDayMeta(value: unknown): value is DayMeta {
  return typeof value === 'object' && value !== null && 'day' in value && 'year' in value;
}

function isoOf(event: CalendarDateTemplateEvent): string {
  return localIsoDate(new Date(event.year, event.month, event.day));
}

export function CalendarView({
  rows,
  onReveal,
}: {
  rows: OfferRow[];
  onReveal: (offerId: string) => void;
}) {
  const [selected, setSelected] = useState<Date | null>(() => new Date());
  // evergreen offers have no window and would otherwise dot every day
  const dated = useMemo(
    () => rows.filter((row) => row.windowStart !== null || row.windowEnd !== null),
    [rows],
  );
  const selectedIso = selected === null ? null : localIsoDate(selected);
  const onSelectedDay = selectedIso === null ? [] : offersOnDay(dated, selectedIso);

  const dateTemplate = (event: CalendarDateTemplateEvent) => {
    const count = offersOnDay(dated, isoOf(event)).length;
    return (
      <span className="cal-cell">
        <span>{event.day}</span>
        {count > 0 && (
          <span className="cal-dots" aria-hidden="true">
            {Array.from({ length: Math.min(count, MAX_DOTS) }, (_, i) => (
              <span key={i} className="cal-dot" />
            ))}
            {count > MAX_DOTS && <span>+{count - MAX_DOTS}</span>}
          </span>
        )}
        <span className="sr-only">{count === 0 ? 'no offers' : plural(count, 'offer')}</span>
      </span>
    );
  };

  return (
    <div className="calendar-view">
      <div>
        <Calendar
          inline
          value={selected}
          onChange={(event) => {
            setSelected(event.value ?? null);
          }}
          dateTemplate={dateTemplate}
          pt={{
            // PrimeReact puts aria-selected on a role-less span inside the cell, which axe rejects;
            // the gridcell itself is where it belongs
            day: (options) => {
              const date: unknown = options?.context.date;
              const isSelected =
                selected !== null &&
                isDayMeta(date) &&
                date.year === selected.getFullYear() &&
                date.month === selected.getMonth() &&
                date.day === selected.getDate();
              return { 'aria-selected': isSelected };
            },
            dayLabel: { 'aria-selected': undefined },
          }}
        />
      </div>
      <section aria-live="polite" aria-labelledby="day-heading">
        <h2 id="day-heading" className="activity-day">
          {selectedIso === null ? 'Pick a day' : `Offers on ${formatDate(selectedIso)}`}
        </h2>
        {onSelectedDay.length === 0 ? (
          <p className="empty-state">No dated offers on this day.</p>
        ) : (
          <ul className="day-list">
            {onSelectedDay.map((row) => (
              <li key={row.id}>
                <div className="offer-name">
                  <span className="offer-title">{row.name}</span>
                  <span className="offer-vendor">
                    {row.vendor} · {windowLabel(row.windowStart, row.windowEnd)}
                  </span>
                </div>
                <div className="card-actions u-mt-2">
                  <StatusTag
                    status={row.derivedStatus}
                    expiringSoon={row.expiringSoon}
                    daysLeft={row.daysLeft}
                  />
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
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
