import { describe, expect, it } from 'vitest';

import {
  checkedLabel,
  formatDate,
  plural,
  priceRangeLabel,
  relativeTime,
  windowLabel,
} from './format.ts';

describe('formatDate', () => {
  it('renders the calendar date without timezone drift', () => {
    expect(formatDate('2026-09-29')).toBe('Sep 29, 2026');
    expect(formatDate('2026-01-01')).toBe('Jan 1, 2026');
  });
});

describe('windowLabel', () => {
  it.each([
    ['2026-09-14', '2026-11-27', 'Sep 14 – Nov 27, 2026'],
    ['2026-12-20', '2027-01-15', 'Dec 20, 2026 – Jan 15, 2027'],
    [null, '2026-11-30', 'Until Nov 30, 2026'],
    ['2026-02-05', null, 'From Feb 5, 2026'],
    [null, null, 'No end date'],
  ])('%s .. %s -> %s', (start, end, expected) => {
    expect(windowLabel(start, end)).toBe(expected);
  });
});

describe('checkedLabel', () => {
  it.each([
    [0, 'Checked today'],
    [1, 'Checked yesterday'],
    [5, 'Checked 5 days ago'],
    [30, 'Checked 30 days ago'],
    [31, 'Checked Sep 5, 2026'],
  ])('%i days -> %s', (days, expected) => {
    expect(checkedLabel(days, '2026-09-05')).toBe(expected);
  });
});

describe('priceRangeLabel', () => {
  it('gives one figure, or both ends when they differ', () => {
    expect(priceRangeLabel({ min: 165, max: 165 })).toBe('$165');
    expect(priceRangeLabel({ min: 100, max: 300 })).toBe('$100–$300');
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-09-29T12:00:00Z');

  it.each([
    ['2026-09-29T11:59:30Z', 'just now'],
    ['2026-09-29T11:45:00Z', '15 minutes ago'],
    ['2026-09-29T09:00:00Z', '3 hours ago'],
    ['2026-09-27T12:00:00Z', '2 days ago'],
    ['2026-09-28T12:00:00Z', 'yesterday'],
    ['2026-07-01T12:00:00Z', 'Jul 1, 2026'],
  ])('%s -> %s', (value, expected) => {
    expect(relativeTime(value, now)).toBe(expected);
  });
});

describe('plural', () => {
  it('handles one and many', () => {
    expect(plural(1, 'offer')).toBe('1 offer');
    expect(plural(14, 'offer')).toBe('14 offers');
  });
});
