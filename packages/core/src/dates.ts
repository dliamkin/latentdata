const ISO_DATE = /^(?<y>\d{4})-(?<m>\d{2})-(?<d>\d{2})$/;

export function isIsoDate(value: string): boolean {
  const groups = ISO_DATE.exec(value)?.groups;
  if (groups === undefined) return false;
  const y = Number(groups.y);
  const m = Number(groups.m);
  const d = Number(groups.d);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// zero-padded calendar dates sort as strings; keeping the comparison here so nothing
// downstream is tempted to go through Date.parse and pick up a timezone
export function compareIsoDates(a: string, b: string): -1 | 0 | 1 {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
