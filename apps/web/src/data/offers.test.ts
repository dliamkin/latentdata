import { describe, expect, it } from 'vitest';

import {
  freeNow,
  listPriceOf,
  matchesAudience,
  matchesClaim,
  matchesQuickFilter,
  matchesTechnology,
  technologyCounts,
  newOfferIds,
  offersOnDay,
  summarize,
  matchesVendor,
  toRows,
  vendorCounts,
  watchListOrder,
} from './offers.ts';
import { snapshot } from './snapshot.ts';

const TODAY = '2026-09-29';
const rows = toRows(snapshot.offers, TODAY, snapshot.catalog);
const byId = (id: string) => {
  const row = rows.find((r) => r.id === id);
  if (row === undefined) throw new Error(`missing fixture ${id}`);
  return row;
};

describe('toRows', () => {
  it('derives status from dates and stored hints', () => {
    expect(byId('fx-active-long').derivedStatus).toBe('active');
    expect(byId('fx-upcoming').derivedStatus).toBe('upcoming');
    expect(byId('fx-expired').derivedStatus).toBe('expired');
    expect(byId('fx-evergreen').derivedStatus).toBe('evergreen');
    expect(byId('fx-unverified').derivedStatus).toBe('unverified');
    expect(byId('fx-recurring-undated').derivedStatus).toBe('upcoming');
  });

  it('flags the watch list and new offers', () => {
    expect(byId('fx-recurring-expired').watch).toBe(true);
    expect(byId('fx-unverified').watch).toBe(true);
    expect(byId('fx-expired').watch).toBe(false);
    expect(rows.every((r) => !r.isNew)).toBe(true);
    expect(
      toRows(snapshot.offers, '2020-01-05').find((r) => r.id === 'fx-active-long')?.isNew,
    ).toBe(true);
  });

  it('provides sortable ranks', () => {
    expect(byId('fx-active-long').weightRank).toBeLessThan(byId('fx-expired').weightRank);
    expect(byId('fx-evergreen').windowEndSort).toBe('9999-12-31');
  });

  it('gives every row a cost, stored or implied, and sorts what is free first', () => {
    const byId = new Map(toRows(snapshot.offers, '2026-09-29').map((row) => [row.id, row]));
    expect(byId.get('fx-active-long')?.costToYou).toBe('nothing');
    expect(byId.get('fx-upcoming')?.costToYou).toBe('reduced-price');
    expect(byId.get('fx-training-only')?.costToYou).toBe('certificate-fee');
    // stored on the offer: nothing about a free exam says a purchase comes first
    expect(byId.get('fx-recurring-undated')?.costToYou).toBe('purchase-first');
    const rank = (id: string): number => byId.get(id)?.whatIsFreeRank ?? -1;
    expect(rank('fx-active-long')).toBeLessThan(rank('fx-evergreen'));
    expect(rank('fx-evergreen')).toBeLessThan(rank('fx-recurring-undated'));
    expect(rank('fx-recurring-undated')).toBeLessThan(rank('fx-upcoming'));
    expect(rank('fx-upcoming')).toBeLessThan(rank('fx-training-only'));
  });

  it('prices an offer from the catalog entry it names, and only then', () => {
    expect(byId('fx-active-long').listPrice).toEqual({ min: 200, max: 200 });
    expect(byId('fx-upcoming').listPrice).toEqual({ min: 350, max: 350 });
    // named in the catalog, but the vendor publishes no single price
    expect(byId('fx-recurring-expired').listPrice).toBeNull();
    // not in the catalog at all
    expect(byId('fx-evergreen').listPrice).toBeNull();
    expect(toRows(snapshot.offers, TODAY).every((row) => row.listPrice === null)).toBe(true);
  });

  it('gives a range when an offer is for any exam of the vendor', () => {
    const template = snapshot.catalog.find((entry) => entry.kind === 'exam');
    if (template === undefined) throw new Error('the fixture has no exam entry');
    const entry = (id: string, listPriceUsd: number | null) => ({
      ...template,
      id,
      name: id,
      vendor: 'Acme',
      examCode: null,
      aliases: [],
      listPriceUsd,
    });
    const catalog = [entry('acme-one', 100), entry('acme-two', 300), entry('acme-three', null)];
    const any = { vendor: 'Acme', certifications: ['Any Acme certification'], examCode: null };
    expect(listPriceOf(any, catalog)).toEqual({ min: 100, max: 300 });
    // a named credential without a price is not answered by the vendor's other prices
    const named = { vendor: 'Acme', certifications: ['acme-three'], examCode: null };
    expect(listPriceOf(named, catalog)).toBeNull();
  });

  it('puts the dearer exam first among offers that are otherwise the same', () => {
    const unpriced = toRows(snapshot.offers, TODAY).find((row) => row.id === 'fx-active-long');
    expect(byId('fx-active-long').whatIsFreeRank).toBeLessThan(unpriced?.whatIsFreeRank ?? -1);
  });

  it('counts the days since an offer was last checked', () => {
    expect(byId('fx-active-long').checkedDaysAgo).toBe(28);
    // never negative, whatever the visitor's clock says
    expect(toRows(snapshot.offers, '2026-08-01')[0]?.checkedDaysAgo).toBe(0);
  });

  it('groups rows by what to act on first', () => {
    expect(byId('fx-active-long').group).toBe('open');
    expect(byId('fx-upcoming').group).toBe('later');
    expect(byId('fx-evergreen').group).toBe('always');
    expect(byId('fx-unverified').group).toBe('check');
    expect(byId('fx-expired').group).toBe('expired');
    expect(
      toRows(snapshot.offers, '2099-12-20').find((r) => r.id === 'fx-active-long')?.group,
    ).toBe('ending');
  });

  it('counts vendors, busiest first, and filters by them', () => {
    const sample = [
      { vendor: 'Microsoft' },
      { vendor: 'AWS' },
      { vendor: 'Microsoft' },
      { vendor: 'Oracle' },
      { vendor: 'AWS' },
      { vendor: 'Microsoft' },
    ];
    expect(vendorCounts(sample)).toEqual([
      { vendor: 'Microsoft', count: 3 },
      { vendor: 'AWS', count: 2 },
      { vendor: 'Oracle', count: 1 },
    ]);
    // a tie falls back to the name so the row doesn't reshuffle between renders
    expect(vendorCounts([{ vendor: 'Zoom' }, { vendor: 'Adobe' }]).map((v) => v.vendor)).toEqual([
      'Adobe',
      'Zoom',
    ]);

    const row = { vendor: 'AWS' };
    expect(matchesVendor(row, [])).toBe(true);
    expect(matchesVendor(row, ['AWS'])).toBe(true);
    expect(matchesVendor(row, ['Oracle'])).toBe(false);
    expect(matchesVendor(row, ['Oracle', 'AWS'])).toBe(true);
  });

  it('measures how much of a dated window has elapsed', () => {
    // fx-expired runs Jan 10 – Feb 10 2020: 31 days
    const mid = toRows(snapshot.offers, '2020-01-20').find((r) => r.id === 'fx-expired');
    expect(mid?.windowProgress).toBeCloseTo(10 / 31);
    expect(byId('fx-expired').windowProgress).toBeNull(); // past the end
    expect(byId('fx-upcoming').windowProgress).toBeNull(); // before the start
    expect(byId('fx-evergreen').windowProgress).toBeNull(); // no dates
  });
});

describe('matchesQuickFilter', () => {
  const none = new Set<string>();
  it.each([
    ['fx-active-long', 'active', true],
    ['fx-expired', 'active', false],
    ['fx-upcoming', 'upcoming', true],
    ['fx-evergreen', 'evergreen', true],
    ['fx-active-long', 'expiring', false],
  ] as const)('%s / %s -> %s', (id, filter, expected) => {
    expect(matchesQuickFilter(byId(id), filter, none)).toBe(expected);
  });

  it('uses the event-derived set for new', () => {
    expect(matchesQuickFilter(byId('fx-expired'), 'new', new Set(['fx-expired']))).toBe(true);
    expect(matchesQuickFilter(byId('fx-expired'), 'new', none)).toBe(false);
    expect(matchesQuickFilter(byId('fx-expired'), null, none)).toBe(true);
  });
});

describe('the audience lens', () => {
  it('keeps everything when no track is chosen', () => {
    expect(rows.every((row) => matchesAudience(row, null))).toBe(true);
  });

  it('keeps the offers whose tracks include the chosen one', () => {
    expect(rows.filter((row) => matchesAudience(row, 'software')).map((r) => r.id)).toEqual([
      'fx-active-long',
      'fx-evergreen',
      'fx-unverified',
    ]);
    expect(rows.filter((row) => matchesAudience(row, 'it')).map((r) => r.id)).toEqual([
      'fx-active-long',
      'fx-upcoming',
      'fx-expired',
      'fx-recurring-undated',
    ]);
    // marketing and business credentials sit in neither
    expect(matchesAudience(byId('fx-training-only'), 'software')).toBe(false);
    expect(matchesAudience(byId('fx-training-only'), 'it')).toBe(false);
  });

  it('filters by technology and counts the ones in use, in core order', () => {
    expect(matchesTechnology(byId('fx-unverified'), 'react')).toBe(true);
    expect(matchesTechnology(byId('fx-unverified'), 'python')).toBe(false);
    expect(matchesTechnology(byId('fx-unverified'), null)).toBe(true);
    expect(technologyCounts(rows)).toEqual([
      { technology: 'javascript', count: 1 },
      { technology: 'python', count: 1 },
      { technology: 'sql', count: 1 },
      { technology: 'react', count: 1 },
      { technology: 'kubernetes', count: 1 },
      { technology: 'linux', count: 1 },
    ]);
  });
});

describe('matchesClaim', () => {
  const shown = (claim: Parameters<typeof matchesClaim>[1]): string[] =>
    rows.filter((row) => matchesClaim(row, claim)).map((row) => row.id);

  it('hides nothing until the visitor says who they are', () => {
    expect(shown(null)).toHaveLength(rows.length);
  });

  it('keeps what is open to everyone, plus what the visitor can claim', () => {
    expect(shown([])).toEqual(['fx-active-long', 'fx-expired', 'fx-evergreen', 'fx-training-only']);
    expect(shown(['student'])).toContain('fx-upcoming');
    expect(shown(['student'])).not.toContain('fx-unverified');
    // one of an offer's groups is enough
    expect(shown(['customer'])).toContain('fx-recurring-undated');
  });
});

describe('freeNow', () => {
  it('counts open offers that cost nothing and adds up what they normally cost', () => {
    // fx-active-long (200) and fx-evergreen (unpriced); the unverified one is not open
    expect(freeNow(rows)).toEqual({ offers: 2, usd: 200 });
    expect(freeNow([])).toEqual({ offers: 0, usd: 0 });
  });
});

describe('newOfferIds', () => {
  it('keeps discoveries from the last seven days only', () => {
    expect(newOfferIds(snapshot.events, new Date('2020-01-05T00:00:00Z'))).toEqual(
      new Set(['fx-active-long', 'fx-upcoming']),
    );
    expect(newOfferIds(snapshot.events, new Date('2026-09-29T00:00:00Z')).size).toBe(0);
  });
});

describe('summarize', () => {
  it('counts each bucket', () => {
    expect(summarize(rows, new Set(['fx-expired']))).toEqual({
      active: 1,
      expiring: 0,
      upcoming: 2,
      evergreen: 2,
      watch: 3,
      new: 1,
    });
  });
});

describe('offersOnDay', () => {
  it('paints dated windows and marks open-ended edges', () => {
    expect(offersOnDay(rows, '2026-09-29').map((r) => r.id)).toEqual(['fx-active-long']);
    expect(offersOnDay(rows, '2020-01-10').map((r) => r.id)).toEqual([
      'fx-active-long',
      'fx-expired',
    ]);
    expect(offersOnDay(rows, '2019-12-31')).toEqual([]);
  });
});

describe('watchListOrder', () => {
  it('sorts dated expectations first, then by name', () => {
    const sorted = rows.filter((r) => r.watch).sort(watchListOrder);
    expect(sorted.map((r) => r.id)).toEqual([
      'fx-recurring-expired',
      'fx-unverified',
      'fx-recurring-undated',
    ]);
  });
});
