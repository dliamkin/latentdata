import { describe, expect, it } from 'vitest';

import type { OfferStatus } from './schemas.ts';
import {
  daysUntilEnd,
  deriveStatus,
  isExpiringSoon,
  isWatchList,
  type StatusInput,
} from './status.ts';

function offer(
  status: OfferStatus,
  windowStart: string | null,
  windowEnd: string | null,
  isRecurring = false,
): StatusInput {
  return { status, windowStart, windowEnd, recurring: { isRecurring } };
}

describe('deriveStatus', () => {
  it.each<[string, StatusInput, string, OfferStatus]>([
    [
      'today equals windowEnd is still active',
      offer('active', '2026-09-01', '2026-09-29'),
      '2026-09-29',
      'active',
    ],
    [
      'the day after windowEnd is expired',
      offer('active', '2026-09-01', '2026-09-29'),
      '2026-09-30',
      'expired',
    ],
    [
      'null end with past start is active',
      offer('active', '2026-02-05', null),
      '2026-09-29',
      'active',
    ],
    [
      'future start is upcoming',
      offer('active', '2026-11-17', '2026-11-26'),
      '2026-09-29',
      'upcoming',
    ],
    [
      'start equal to today is active',
      offer('upcoming', '2026-09-29', '2026-11-26'),
      '2026-09-29',
      'active',
    ],
    [
      'stored upcoming with null start stays upcoming',
      offer('upcoming', null, null),
      '2026-09-29',
      'upcoming',
    ],
    [
      'stored upcoming with future start and no end',
      offer('upcoming', '2026-11-17', null),
      '2026-09-29',
      'upcoming',
    ],
    [
      'stored unverified inside the window stays unverified',
      offer('unverified', '2026-09-01', '2026-12-31'),
      '2026-09-29',
      'unverified',
    ],
    [
      'stored unverified past windowEnd is expired',
      offer('unverified', '2026-09-01', '2026-09-16'),
      '2026-09-29',
      'expired',
    ],
    [
      'stored unverified with no dates stays unverified',
      offer('unverified', null, null),
      '2026-09-29',
      'unverified',
    ],
    ['no dates at all is evergreen', offer('evergreen', null, null), '2026-09-29', 'evergreen'],
    [
      'stored active with no dates is evergreen',
      offer('active', null, null),
      '2026-09-29',
      'evergreen',
    ],
    [
      'stored expired inside a live window is active',
      offer('expired', '2026-09-01', '2026-12-31'),
      '2026-09-29',
      'active',
    ],
    [
      'month rollover: end Sep 30, today Oct 1',
      offer('active', null, '2026-09-30'),
      '2026-10-01',
      'expired',
    ],
    [
      'year rollover: end Dec 31, today Jan 1',
      offer('active', null, '2026-12-31'),
      '2027-01-01',
      'expired',
    ],
    [
      'year rollover: end Dec 31, today Dec 31',
      offer('active', null, '2026-12-31'),
      '2026-12-31',
      'active',
    ],
    [
      'end before start-of-window today, start in the future',
      offer('active', '2027-02-01', '2027-03-01'),
      '2026-12-31',
      'upcoming',
    ],
  ])('%s', (_label, input, today, expected) => {
    expect(deriveStatus(input, today)).toBe(expected);
  });
});

describe('isExpiringSoon', () => {
  const o = offer('active', '2026-09-01', '2026-10-13');

  it('is inclusive of today and of the 14th day', () => {
    expect(isExpiringSoon(o, '2026-09-29')).toBe(true);
    expect(isExpiringSoon(o, '2026-10-13')).toBe(true);
  });

  it('is false one day outside the window', () => {
    expect(isExpiringSoon(o, '2026-09-28')).toBe(false);
    expect(isExpiringSoon(o, '2026-10-14')).toBe(false);
  });

  it('honours a custom horizon', () => {
    expect(isExpiringSoon(o, '2026-10-06', 7)).toBe(true);
    expect(isExpiringSoon(o, '2026-10-05', 7)).toBe(false);
  });

  it('is false for anything that is not active', () => {
    expect(isExpiringSoon(offer('unverified', '2026-09-01', '2026-10-01'), '2026-09-29')).toBe(
      false,
    );
    expect(isExpiringSoon(offer('active', '2026-10-01', '2026-10-05'), '2026-09-29')).toBe(false);
    expect(isExpiringSoon(offer('active', null, null), '2026-09-29')).toBe(false);
  });
});

describe('isWatchList', () => {
  it('includes recurring offers that are expired or upcoming', () => {
    expect(isWatchList(offer('active', '2026-08-19', '2026-09-16', true), '2026-09-29')).toBe(true);
    expect(isWatchList(offer('upcoming', null, null, true), '2026-09-29')).toBe(true);
  });

  it('excludes recurring offers that are live or evergreen', () => {
    expect(isWatchList(offer('active', '2026-09-01', '2026-12-31', true), '2026-09-29')).toBe(
      false,
    );
    expect(isWatchList(offer('evergreen', null, null, true), '2026-09-29')).toBe(false);
  });

  it('excludes one-off expired offers', () => {
    expect(isWatchList(offer('active', '2026-08-19', '2026-09-16'), '2026-09-29')).toBe(false);
  });

  it('always includes unverified offers', () => {
    expect(isWatchList(offer('unverified', null, null), '2026-09-29')).toBe(true);
  });
});

describe('daysUntilEnd', () => {
  it('counts calendar days for active offers', () => {
    expect(daysUntilEnd(offer('active', null, '2026-09-30'), '2026-09-29')).toBe(1);
    expect(daysUntilEnd(offer('active', null, '2026-09-29'), '2026-09-29')).toBe(0);
  });

  it('is null without an end date or outside active', () => {
    expect(daysUntilEnd(offer('active', null, null), '2026-09-29')).toBeNull();
    expect(daysUntilEnd(offer('active', '2026-10-01', '2026-10-05'), '2026-09-29')).toBeNull();
    expect(daysUntilEnd(offer('unverified', null, '2026-10-05'), '2026-09-29')).toBeNull();
  });
});
