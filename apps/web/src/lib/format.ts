const dateFormat = new Intl.DateTimeFormat('en', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});
const dayFormat = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat('en', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZoneName: 'short',
});
const weekdayFormat = new Intl.DateTimeFormat('en', {
  weekday: 'short',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});
const timeFormat = new Intl.DateTimeFormat('en', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

// calendar dates are rendered on the visitor's local calendar, hence the T00:00:00 without Z
function localDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

export function formatDate(iso: string): string {
  return dateFormat.format(localDate(iso));
}

export function formatDateTime(isoDateTime: string): string {
  return dateTimeFormat.format(new Date(isoDateTime));
}

// "Wed, Sep 30, 2026" in the visitor's calendar
export function formatWeekday(iso: string): string {
  return weekdayFormat.format(localDate(iso));
}

// "06:00" in the visitor's zone
export function formatTime(isoDateTime: string): string {
  return timeFormat.format(new Date(isoDateTime));
}

// "Today", "Yesterday", or the short date
export function dayLabel(iso: string, today: string): string {
  if (iso === today) return 'Today';
  const yesterday = new Date(`${today}T00:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  const y = `${String(yesterday.getFullYear())}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  return iso === y ? 'Yesterday' : dayFormat.format(localDate(iso));
}

export function windowLabel(start: string | null, end: string | null): string {
  if (start !== null && end !== null) {
    const sameYear = start.slice(0, 4) === end.slice(0, 4);
    const from = sameYear ? dayFormat.format(localDate(start)) : formatDate(start);
    return `${from} – ${formatDate(end)}`;
  }
  if (end !== null) return `Until ${formatDate(end)}`;
  if (start !== null) return `From ${formatDate(start)}`;
  return 'No end date';
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

export function relativeTime(isoDateTime: string, now: Date = new Date()): string {
  const delta = new Date(isoDateTime).getTime() - now.getTime();
  const magnitude = Math.abs(delta);
  if (magnitude > 30 * 86_400_000) return formatDate(isoDateTime.slice(0, 10));
  for (const [unit, ms] of UNITS) {
    if (magnitude >= ms) return relative.format(Math.round(delta / ms), unit);
  }
  return 'just now';
}

const usdFormat = new Intl.NumberFormat('en', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

// "USD 150", or "Free" for a zero price; null has no price published
export function priceLabel(listPriceUsd: number | null): string {
  if (listPriceUsd === null) return 'Price not published';
  return listPriceUsd === 0 ? 'Free' : usdFormat.format(listPriceUsd);
}

export function plural(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}
