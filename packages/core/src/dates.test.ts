import { describe, expect, it } from 'vitest';

import {
  addDays,
  compareIsoDates,
  daysBetween,
  isIsoDate,
  localIsoDate,
  utcIsoDate,
} from './dates.ts';

describe('isIsoDate', () => {
  it.each([
    ['2026-09-29', true],
    ['2026-02-28', true],
    ['2028-02-29', true],
    ['2026-02-29', false],
    ['2026-02-30', false],
    ['2026-13-01', false],
    ['2026-00-10', false],
    ['2026-9-5', false],
    ['2026-09-29T00:00:00Z', false],
    ['', false],
  ])('%s -> %s', (value, expected) => {
    expect(isIsoDate(value)).toBe(expected);
  });
});

describe('compareIsoDates', () => {
  it.each([
    ['2026-09-29', '2026-09-29', 0],
    ['2026-09-29', '2026-09-30', -1],
    ['2026-09-30', '2026-09-29', 1],
    ['2026-12-31', '2027-01-01', -1],
    ['2026-01-31', '2026-02-01', -1],
  ])('%s vs %s -> %i', (a, b, expected) => {
    expect(compareIsoDates(a, b)).toBe(expected);
  });
});

describe('addDays', () => {
  it.each([
    ['2026-09-29', 1, '2026-09-30'],
    ['2026-09-30', 1, '2026-10-01'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2028-02-28', 1, '2028-02-29'],
    ['2026-03-29', -1, '2026-03-28'],
    ['2026-01-01', -1, '2025-12-31'],
    ['2026-09-29', 14, '2026-10-13'],
    ['2026-09-29', 0, '2026-09-29'],
  ])('%s + %i -> %s', (date, days, expected) => {
    expect(addDays(date, days)).toBe(expected);
  });

  it('rejects an invalid date', () => {
    expect(() => addDays('2026-02-30', 1)).toThrow(TypeError);
  });
});

describe('daysBetween', () => {
  it.each([
    ['2026-09-29', '2026-09-29', 0],
    ['2026-09-29', '2026-10-13', 14],
    ['2026-10-13', '2026-09-29', -14],
    ['2026-12-31', '2027-01-01', 1],
    ['2026-03-01', '2026-04-01', 31],
  ])('%s -> %s = %i', (from, to, expected) => {
    expect(daysBetween(from, to)).toBe(expected);
  });
});

describe('today helpers', () => {
  it('utcIsoDate uses the UTC calendar day', () => {
    expect(utcIsoDate(new Date('2026-12-31T23:59:59Z'))).toBe('2026-12-31');
    expect(utcIsoDate(new Date('2027-01-01T00:00:00Z'))).toBe('2027-01-01');
  });

  it('localIsoDate uses the local calendar day', () => {
    const now = new Date(2026, 0, 5, 23, 30);
    expect(localIsoDate(now)).toBe('2026-01-05');
  });
});
