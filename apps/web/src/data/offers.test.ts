import { describe, expect, it } from 'vitest';

import {
  matchesQuickFilter,
  newOfferIds,
  offersOnDay,
  summarize,
  toRows,
  watchListOrder,
} from './offers.ts';
import { snapshot } from './snapshot.ts';

const TODAY = '2026-09-29';
const rows = toRows(snapshot.offers, TODAY);
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
