import { useMemo, useState } from 'react';

import { updateLocaleOption } from 'primereact/api';
import { Button } from 'primereact/button';
import { Calendar, type CalendarDateTemplateEvent } from 'primereact/calendar';

import { localIsoDate } from '@cert-tracker/core';

import { offersOnDay, type OfferRow } from '../data/offers.ts';
import { formatDate, plural, windowLabel } from '../lib/format.ts';
import { VendorMark } from './VendorMark.tsx';
import { StatusTag } from './Tags.tsx';

// three-letter weekday headers instead of PrimeReact's two
updateLocaleOption('dayNamesMin', ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], 'en');

// shade steps for the number of dated offers open on a day; below four the cell stays plain
const HEAT_STEPS = [4, 5, 6, 7] as const;

interface DayMeta {
  day: number;
  month: number;
  year: number;
}

function isDayMeta(value: unknown): value is DayMeta {
  return typeof value === 'object' && value !== null && 'day' in value && 'year' in value;
}

function isoOf(meta: DayMeta): string {
  return localIsoDate(new Date(meta.year, meta.month, meta.day));
}

function heatVar(count: number): string | undefined {
  if (count < HEAT_STEPS[0]) return undefined;
  const step = Math.min(count, HEAT_STEPS[3]);
  return `var(--heat-${String(step)})`;
}

export function CalendarView({
  rows,
  onReveal,
}: {
  rows: OfferRow[];
  onReveal: (offerId: string) => void;
}) {
  const [selected, setSelected] = useState<Date | null>(() => new Date());
  const [viewDate, setViewDate] = useState<Date>(() => new Date());
  // evergreen offers have no window and would otherwise shade every day
  const dated = useMemo(
    () => rows.filter((row) => row.windowStart !== null || row.windowEnd !== null),
    [rows],
  );
  const todayIso = localIsoDate();
  const selectedIso = selected === null ? null : localIsoDate(selected);
  const onSelectedDay = selectedIso === null ? [] : offersOnDay(dated, selectedIso);

  const dateTemplate = (event: CalendarDateTemplateEvent) => {
    const count = offersOnDay(dated, isoOf(event)).length;
    return (
      <span className="cal-cell">
        <span className="cal-day">
          {event.day}
          {isoOf(event) === todayIso && (
            <span className="cal-today" aria-hidden="true">
              today
            </span>
          )}
        </span>
        <span className="cal-count" aria-hidden="true">
          {count > 0 ? count : ''}
        </span>
        <span className="sr-only">{count === 0 ? 'no offers' : plural(count, 'offer')}</span>
      </span>
    );
  };

  const goToday = (): void => {
    const now = new Date();
    setSelected(now);
    setViewDate(now);
  };

  return (
    <div className="calendar-view">
      <section className="panel calendar-panel" aria-label="Month calendar">
        <Button
          outlined
          size="small"
          label="Today"
          className="cal-today-button"
          onClick={goToday}
        />
        <Calendar
          inline
          value={selected}
          viewDate={viewDate}
          onViewDateChange={(event) => {
            setViewDate(event.value);
          }}
          onChange={(event) => {
            setSelected(event.value ?? null);
          }}
          dateTemplate={dateTemplate}
          pt={{
            // PrimeReact puts aria-selected on a role-less span inside the cell, which axe rejects;
            // the gridcell itself is where it belongs. The same hook paints the heat shade and
            // the today ring, which only the cell knows about.
            day: (options) => {
              const date: unknown = options?.context.date;
              if (!isDayMeta(date)) return {};
              const iso = isoOf(date);
              const isSelected = selectedIso === iso;
              const heat = heatVar(offersOnDay(dated, iso).length);
              const style: Record<string, string> = {};
              if (heat !== undefined) style['--heat'] = heat;
              if (iso === todayIso) style['--today-ring'] = 'inset 0 0 0 2px var(--gold)';
              return { 'aria-selected': isSelected, style };
            },
            dayLabel: { 'aria-selected': undefined },
          }}
        />
        <p className="cal-legend">
          Shade and number = dated offers open that day. Evergreen offers aren&apos;t plotted.
        </p>
      </section>
      <section className="panel day-panel" aria-live="polite" aria-labelledby="day-heading">
        <div className="panel-head">
          <h2 id="day-heading" className="section-title">
            {selectedIso === null ? 'Pick a day' : `Open on ${formatDate(selectedIso)}`}
          </h2>
          <span className="eyebrow mono">{plural(onSelectedDay.length, 'offer')}</span>
        </div>
        {onSelectedDay.length === 0 ? (
          <p className="empty-state">No dated offers on this day.</p>
        ) : (
          <ul className="day-list">
            {onSelectedDay.map((row) => (
              <li key={row.id}>
                <div className="offer-cell">
                  <VendorMark vendor={row.vendor} />
                  <div className="offer-name">
                    <span className="offer-title">{row.name}</span>
                    <span className="offer-meta">
                      {row.vendor} ·{' '}
                      <span className="mono">{windowLabel(row.windowStart, row.windowEnd)}</span>
                    </span>
                  </div>
                </div>
                <div className="day-list-side">
                  <StatusTag
                    status={row.derivedStatus}
                    expiringSoon={row.expiringSoon}
                    daysLeft={row.daysLeft}
                  />
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
        )}
      </section>
    </div>
  );
}
