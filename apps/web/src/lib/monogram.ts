// two letters that stand for a vendor: initials of the first two words ("Google Cloud" → GC),
// or the first two letters of a one-word name ("AWS" → AW)
export function monogramText(vendor: string): string {
  const words = vendor.split(/[\s/&-]+/).filter((w) => w !== '');
  const first = words[0] ?? '';
  const second = words[1];
  const letters = second === undefined ? first.slice(0, 2) : `${first[0] ?? ''}${second[0] ?? ''}`;
  return letters.toUpperCase();
}

// a stable hue per vendor so the same company always gets the same colour
export function monogramHue(vendor: string): number {
  let hash = 0;
  for (const ch of vendor) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return hash;
}
