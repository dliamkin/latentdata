// Crockford base32, as the ULID spec wants it
const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TIME_LENGTH = 10;
const RANDOM_BYTES = 10;
const ULID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

function encodeTime(time: number): string {
  if (!Number.isInteger(time) || time < 0 || time > 0xffffffffffff) {
    throw new RangeError(`ulid time out of range: ${String(time)}`);
  }
  let out = '';
  let remaining = time;
  for (let i = 0; i < TIME_LENGTH; i += 1) {
    out = ENCODING.charAt(remaining % 32) + out;
    remaining = Math.floor(remaining / 32);
  }
  return out;
}

// 80 bits -> 16 chars of 5 bits, walking the bytes as one big-endian bit stream
function encodeRandom(bytes: Uint8Array): string {
  if (bytes.length !== RANDOM_BYTES) {
    throw new RangeError(`ulid needs ${String(RANDOM_BYTES)} random bytes`);
  }
  let out = '';
  let acc = 0;
  let bits = 0;
  for (const byte of bytes) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ENCODING.charAt((acc >>> bits) & 31);
    }
    acc &= (1 << bits) - 1;
  }
  return out;
}

export function ulid(time = Date.now(), randomBytes?: Uint8Array): string {
  const bytes = randomBytes ?? globalThis.crypto.getRandomValues(new Uint8Array(RANDOM_BYTES));
  return encodeTime(time) + encodeRandom(bytes);
}

export function isUlid(value: string): boolean {
  return ULID_PATTERN.test(value);
}

export function ulidTime(id: string): number {
  if (!isUlid(id)) throw new TypeError(`not a ulid: ${id}`);
  let time = 0;
  for (const char of id.slice(0, TIME_LENGTH)) {
    time = time * 32 + ENCODING.indexOf(char);
  }
  return time;
}

export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const MAX_SLUG_LENGTH = 60;

export function slugForOffer(vendor: string, name: string, windowEnd: string | null): string {
  const vendorSlug = slugify(vendor);
  const nameSlug = slugify(name);
  // names usually repeat the vendor ("AWS re:Invent ..."); don't double it
  const combined =
    vendorSlug === '' || nameSlug.startsWith(vendorSlug) ? nameSlug : `${vendorSlug}-${nameSlug}`;
  const base = combined.slice(0, MAX_SLUG_LENGTH).replace(/-+$/, '');
  const year = windowEnd?.slice(0, 4);
  if (year === undefined || base.endsWith(year)) return base;
  return `${base}-${year}`;
}

export function uniqueSlug(slug: string, isTaken: (candidate: string) => boolean): string {
  if (!isTaken(slug)) return slug;
  for (let n = 2; ; n += 1) {
    const candidate = `${slug}-${String(n)}`;
    if (!isTaken(candidate)) return candidate;
  }
}
