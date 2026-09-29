import { describe, expect, it } from 'vitest';

import { LAST_VISIT_KEY, groupByDay, rotateLastVisit } from './activity.ts';
import { snapshot } from './snapshot.ts';

const events = [...snapshot.events].sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));

describe('groupByDay', () => {
  it('groups newest-first events by calendar day', () => {
    const groups = groupByDay(events, null);
    expect(groups.map((g) => g.day)).toEqual([
      '2020-03-01',
      '2020-02-11',
      '2020-01-02',
      '2020-01-01',
    ]);
    expect(groups.every((g) => !g.dividerBefore)).toBe(true);
  });

  it('marks the first group older than the last visit', () => {
    const groups = groupByDay(events, '2020-02-15T00:00:00.000Z');
    expect(groups.map((g) => g.dividerBefore)).toEqual([false, true, false, false]);
  });

  it('draws no divider when everything is new or everything is old', () => {
    expect(groupByDay(events, '2019-01-01T00:00:00.000Z').some((g) => g.dividerBefore)).toBe(false);
    expect(groupByDay(events, '2021-01-01T00:00:00.000Z').some((g) => g.dividerBefore)).toBe(false);
  });
});

describe('rotateLastVisit', () => {
  it('returns the previous visit and records this one', () => {
    expect(rotateLastVisit()).toBeNull();
    const first = window.localStorage.getItem(LAST_VISIT_KEY);
    expect(first).not.toBeNull();
    expect(rotateLastVisit()).toBe(first);
  });
});
