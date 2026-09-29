const ISO_DATE = /^(?<y>\d{4})-(?<m>\d{2})-(?<d>\d{2})$/;
const MS_PER_DAY = 86_400_000;

interface DateParts {
  y: number;
  m: number;
  d: number;
}

function parts(value: string): DateParts | null {
  const groups = ISO_DATE.exec(value)?.groups;
  if (groups === undefined) return null;
  const y = Number(groups.y);
  const m = Number(groups.m);
  const d = Number(groups.d);
  const date = new Date(Date.UTC(y, m - 1, d));
  const valid =
    date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  return valid ? { y, m, d } : null;
}

function requireParts(value: string): DateParts {
  const p = parts(value);
  if (p === null) throw new TypeError(`not an ISO calendar date: ${value}`);
  return p;
}

function toUtcMs(value: string): number {
  const { y, m, d } = requireParts(value);
  return Date.UTC(y, m - 1, d);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function isIsoDate(value: string): boolean {
  return parts(value) !== null;
}

// zero-padded calendar dates sort as strings; keeping the comparison here so nothing
// downstream is tempted to go through Date.parse and pick up a timezone
export function compareIsoDates(a: string, b: string): -1 | 0 | 1 {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function addDays(date: string, days: number): string {
  const shifted = new Date(toUtcMs(date) + days * MS_PER_DAY);
  return `${String(shifted.getUTCFullYear())}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

// calendar days from `from` to `to`; negative when `to` is earlier
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY);
}

// the two "today"s: jobs run in UTC, the browser lives on the visitor's calendar
export function utcIsoDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function localIsoDate(now: Date = new Date()): string {
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
