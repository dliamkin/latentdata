import { describe, expect, it } from 'vitest';

import * as keys from './keys.ts';

describe('key builders', () => {
  it.each([
    ['offer', keys.offerKey('aws-x'), { PK: 'OFFER#aws-x', SK: 'META' }],
    ['candidate', keys.candidateKey('01A'), { PK: 'CAND#01A', SK: 'META' }],
    ['signal', keys.signalKey('rss-a', 'abc'), { PK: 'SIG#rss-a', SK: 'abc' }],
    ['source', keys.sourceKey('rss-a'), { PK: 'SOURCE#rss-a', SK: 'META' }],
    [
      'event',
      keys.eventKey('2026-09-29T04:17:00.000Z', '01E'),
      { PK: 'EVENT#2026-09', SK: '2026-09-29T04:17:00.000Z#01E' },
    ],
    ['event guard', keys.eventIdempotencyKey('a#b'), { PK: 'EVENTKEY#a#b', SK: 'META' }],
    ['subscriber', keys.subscriberKey('01S'), { PK: 'SUB#01S', SK: 'META' }],
    ['notification', keys.notificationKey('01E', '01S'), { PK: 'NOTIF#01E', SK: '01S' }],
    ['digest', keys.digestKey('01S', '2026-09-29'), { PK: 'DIGEST#01S', SK: '2026-09-29' }],
    ['budget', keys.budgetKey('2026-09-29'), { PK: 'BUDGET#2026-09-29', SK: 'META' }],
    ['lock', keys.lockKey('publish'), { PK: 'LOCK#publish', SK: 'META' }],
    ['system meta', keys.systemMetaKey(), { PK: 'META#system', SK: 'META' }],
  ])('%s', (_name, actual, expected) => {
    expect(actual).toEqual(expected);
  });

  it('orders offers by stored status, then end date, then id', () => {
    expect(keys.offerGsi1('active', '2026-12-31', 'a')).toEqual({
      GSI1PK: 'OFFERS',
      GSI1SK: 'active#2026-12-31#a',
    });
    expect(keys.offerGsi1('evergreen', null, 'b').GSI1SK).toBe('evergreen#9999-12-31#b');
  });

  it('builds the secondary keys', () => {
    expect(keys.candidateGsi1('verified', '2026-09-29T00:00:00.000Z')).toEqual({
      GSI1PK: 'CANDS#verified',
      GSI1SK: '2026-09-29T00:00:00.000Z',
    });
    expect(keys.sourceGsi1('rss-a')).toEqual({ GSI1PK: 'SOURCES', GSI1SK: 'rss-a' });
    expect(keys.eventGsi1('public', '2026-09-29T00:00:00.000Z').GSI1PK).toBe('EVENTS#public');
    expect(keys.subscriberGsi1('active', 'ntfy', '01S')).toEqual({
      GSI1PK: 'SUBS#active',
      GSI1SK: 'ntfy#01S',
    });
    expect(keys.deferredSignalGsi1('2026-09-29T00:00:00.000Z').GSI1PK).toBe('SIGSTATE#deferred');
  });

  it('computes TTLs in epoch seconds', () => {
    const now = new Date('2026-09-29T00:00:00.000Z');
    expect(keys.epochSeconds(now)).toBe(1_790_640_000);
    expect(keys.ttlAfterDays(now, 30)).toBe(1_790_640_000 + 30 * 86_400);
  });
});
