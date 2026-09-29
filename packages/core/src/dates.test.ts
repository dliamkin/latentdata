import { describe, expect, it } from 'vitest';

import { compareIsoDates, isIsoDate } from './dates.ts';

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
