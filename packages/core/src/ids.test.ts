import { describe, expect, it } from 'vitest';

import { isUlid, slugForOffer, slugify, ulid, ulidTime, uniqueSlug } from './ids.ts';

describe('ulid', () => {
  it('produces a 26-char Crockford string', () => {
    const id = ulid();
    expect(id).toHaveLength(26);
    expect(isUlid(id)).toBe(true);
  });

  it('encodes the timestamp in the first ten chars', () => {
    const time = Date.UTC(2026, 8, 29, 12, 0, 0);
    expect(ulidTime(ulid(time))).toBe(time);
  });

  it('sorts by time', () => {
    const earlier = ulid(1_000_000);
    const later = ulid(1_000_001);
    expect(earlier < later).toBe(true);
  });

  it('is deterministic given the random bytes', () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(ulid(0, bytes)).toBe(ulid(0, bytes));
    expect(ulid(0, bytes)).toBe('0000000000041061050R3GG28A');
  });

  it('matches the spec vectors', () => {
    expect(ulid(0, new Uint8Array(10))).toBe('00000000000000000000000000');
    expect(ulid(0xffffffffffff, new Uint8Array(10).fill(0xff))).toBe('7ZZZZZZZZZZZZZZZZZZZZZZZZZ');
  });

  it('rejects out-of-range input', () => {
    expect(() => ulid(-1)).toThrow(RangeError);
    expect(() => ulid(0, new Uint8Array(3))).toThrow(RangeError);
    expect(() => ulidTime('nope')).toThrow(TypeError);
  });

  it('rejects malformed ids', () => {
    expect(isUlid('8ZZZZZZZZZZZZZZZZZZZZZZZZZ')).toBe(false);
    expect(isUlid('01ARZ3NDEKTSV4RRFFQ69G5FA')).toBe(false);
    expect(isUlid('01ARZ3NDEKTSV4RRFFQ69G5FAI')).toBe(false);
  });
});

describe('slugify', () => {
  it.each([
    ['Google Cloud GEAR — Edition 3 (2026)', 'google-cloud-gear-edition-3-2026'],
    ['  AWS re:Invent  ', 'aws-re-invent'],
    ['Café Über', 'cafe-uber'],
    ['---', ''],
  ])('%s -> %s', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });
});

describe('slugForOffer', () => {
  it('prefixes the vendor and suffixes the end year', () => {
    expect(slugForOffer('Microsoft', 'Fabric Data Days', '2026-08-10')).toBe(
      'microsoft-fabric-data-days-2026',
    );
  });

  it('does not repeat a vendor the name already starts with', () => {
    expect(slugForOffer('AWS', 'AWS re:Invent registrant voucher', '2027-01-31')).toBe(
      'aws-re-invent-registrant-voucher-2027',
    );
  });

  it('does not repeat a year the name already ends with', () => {
    expect(slugForOffer('Salesforce', 'Dreamforce 2026 exam', '2026-09-17')).toBe(
      'salesforce-dreamforce-2026-exam-2026',
    );
    expect(slugForOffer('Oracle', 'Race to certification 2025', '2025-10-31')).toBe(
      'oracle-race-to-certification-2025',
    );
  });

  it('has no year without an end date', () => {
    expect(slugForOffer('Oracle', 'Foundations free', null)).toBe('oracle-foundations-free');
  });

  it('caps the length before adding the year', () => {
    const long = slugForOffer('Vendor', 'x'.repeat(100), '2026-12-31');
    expect(long.length).toBeLessThanOrEqual(65);
    expect(long.endsWith('-2026')).toBe(true);
  });
});

describe('uniqueSlug', () => {
  it('returns the slug when free', () => {
    expect(uniqueSlug('a-b', () => false)).toBe('a-b');
  });

  it('appends a counter starting at 2', () => {
    const taken = new Set(['a-b', 'a-b-2']);
    expect(uniqueSlug('a-b', (s) => taken.has(s))).toBe('a-b-3');
  });
});
