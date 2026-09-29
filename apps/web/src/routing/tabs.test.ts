import { describe, expect, it } from 'vitest';

import { offerIdFromSearch, tabFromHash } from './tabs.ts';

describe('tabFromHash', () => {
  it.each([
    ['', 'offers'],
    ['#offers', 'offers'],
    ['#calendar', 'calendar'],
    ['#watchlist', 'watchlist'],
    ['#activity', 'activity'],
    ['#review', 'review'],
    ['#nope', 'offers'],
  ])('%s -> %s', (hash, expected) => {
    expect(tabFromHash(hash)).toBe(expected);
  });
});

describe('offerIdFromSearch', () => {
  it('reads the offer parameter', () => {
    expect(offerIdFromSearch('?offer=aws-aif2cloud-2026')).toBe('aws-aif2cloud-2026');
    expect(offerIdFromSearch('?admin&offer=x')).toBe('x');
    expect(offerIdFromSearch('?offer=')).toBeNull();
    expect(offerIdFromSearch('')).toBeNull();
  });
});
