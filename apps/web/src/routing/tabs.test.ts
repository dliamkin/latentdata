import { describe, expect, it } from 'vitest';

import { offerIdFromSearch, routeFromHash, type Route } from './tabs.ts';

describe('routeFromHash', () => {
  it.each<[string, Route]>([
    ['', 'offers'],
    ['#offers', 'offers'],
    ['#calendar', 'calendar'],
    ['#watchlist', 'watchlist'],
    ['#catalog', 'catalog'],
    ['#activity', 'activity'],
    ['#review', 'review'],
    ['#architecture', 'architecture'],
    ['#privacy', 'privacy'],
    ['#nope', 'offers'],
  ])('%s -> %s', (hash, expected) => {
    expect(routeFromHash(hash)).toBe(expected);
  });

  // the skip link is href="#main", so an in-page anchor must not navigate away from the page it
  // was meant to skip into
  it('leaves the route alone for an in-page anchor', () => {
    expect(routeFromHash('#main', 'calendar')).toBe('calendar');
    expect(routeFromHash('#main', 'privacy')).toBe('privacy');
    expect(routeFromHash('#nope', 'architecture')).toBe('architecture');
  });

  it('still falls back to offers when there is no current route', () => {
    expect(routeFromHash('#main')).toBe('offers');
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
