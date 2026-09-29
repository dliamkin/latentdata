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

export function plural(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}
