import { describe, expect, it } from 'vitest';

import { offer, source } from '../../test/helpers.ts';
import {
  buildSnapshot,
  eventTailStart,
  sameContent,
  serializeSnapshot,
  type SnapshotInput,
} from './snapshot.ts';

const NOW = new Date('2026-09-29T12:00:00.000Z');

function input(overrides: Partial<SnapshotInput> = {}): SnapshotInput {
  return {
    offers: [offer({ id: 'b' }), offer({ id: 'a' })],
    events: [
      {
        eventId: '01ARZ3NDEKTSV4RRFFQ69G5FA2',
        type: 'offer.discovered',
        occurredAt: '2026-09-20T00:00:00.000Z',
        offerId: 'b',
        payload: {},
      },
      {
        eventId: '01ARZ3NDEKTSV4RRFFQ69G5FA1',
        type: 'offer.discovered',
        occurredAt: '2026-09-10T00:00:00.000Z',
        offerId: 'a',
        payload: {},
      },
    ],
    sources: [source(), source({ sourceId: 'x', state: { consecutiveFailures: 5 } })],
    meta: { lastPollAt: null, lastStatusRunAt: '2026-09-29T04:17:00.000Z' },
    now: NOW,
    ...overrides,
  };
}

describe('buildSnapshot', () => {
  it('sorts offers by id and events by time, and summarises source health', () => {
    const snapshot = buildSnapshot(input());
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.generatedAt).toBe(NOW.toISOString());
    expect(snapshot.offers.map((o) => o.id)).toEqual(['a', 'b']);
    expect(snapshot.events.map((e) => e.offerId)).toEqual(['a', 'b']);
    expect(snapshot.meta.sourceHealth).toEqual({ total: 2, unhealthy: 1 });
  });

  it('refuses to build from an invalid offer', () => {
    expect(() => buildSnapshot(input({ offers: [offer({ cost: 'should be null' })] }))).toThrow();
  });
});

describe('sameContent', () => {
  const published = serializeSnapshot(buildSnapshot(input()));

  it('ignores the generation time and the job timestamps', () => {
    const later = buildSnapshot(
      input({
        now: new Date('2026-09-30T12:00:00.000Z'),
        meta: { lastPollAt: '2026-09-30T11:07:00.000Z', lastStatusRunAt: null },
      }),
    );
    expect(sameContent(later, published)).toBe(true);
  });

  it('sees a changed offer, a new event and a source going unhealthy', () => {
    expect(sameContent(buildSnapshot(input({ offers: [offer({ id: 'a' })] })), published)).toBe(
      false,
    );
    expect(sameContent(buildSnapshot(input({ events: [] })), published)).toBe(false);
    expect(sameContent(buildSnapshot(input({ sources: [source()] })), published)).toBe(false);
  });

  it('treats an unreadable published file as different', () => {
    expect(sameContent(buildSnapshot(input()), '{not json')).toBe(false);
    expect(sameContent(buildSnapshot(input()), '{"schemaVersion":2}')).toBe(false);
  });
});

describe('eventTailStart', () => {
  it('is ninety days back', () => {
    expect(eventTailStart(NOW)).toBe('2026-07-01T12:00:00.000Z');
  });
});
