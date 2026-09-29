import {
  DeleteCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Offer } from '@cert-tracker/core';

import {
  expiringEventFor,
  runStatus,
  transitionFor,
  type StatusDeps,
} from '../src/handlers/status.ts';
import type { Liveness } from '../src/lib/liveness.ts';
import { offerToItem } from '../src/lib/repo/index.ts';
import { TABLE, awsError, docMock, offer, transactionCancelled } from './helpers.ts';

const TODAY = '2026-09-29';
const NOW = new Date(`${TODAY}T04:17:00.000Z`);
const { doc, mock } = docMock();

function deps(liveness: Liveness = 'alive'): StatusDeps & { check: ReturnType<typeof vi.fn> } {
  const check = vi.fn(() => Promise.resolve(liveness));
  return { doc, table: TABLE, liveness: { check }, now: () => NOW, check };
}

function arrange(offers: Offer[]): void {
  mock.on(PutCommand).resolves({});
  mock.on(DeleteCommand).resolves({});
  mock.on(UpdateCommand).resolves({});
  mock.on(TransactWriteCommand).resolves({});
  mock.on(QueryCommand).resolves({ Items: offers.map(offerToItem) });
}

const transactions = () =>
  mock.commandCalls(TransactWriteCommand).map((call) => call.args[0].input.TransactItems ?? []);

beforeEach(() => {
  mock.reset();
});

describe('transitionFor', () => {
  it.each<[string, Partial<Offer>, string | null]>([
    ['active past its end expires', { status: 'active', windowEnd: '2026-09-28' }, 'offer.expired'],
    ['active on its last day stays', { status: 'active', windowEnd: TODAY }, null],
    [
      'upcoming whose window opened',
      { status: 'upcoming', windowStart: TODAY },
      'offer.window_opened',
    ],
    ['upcoming still in the future', { status: 'upcoming', windowStart: '2026-10-05' }, null],
    [
      'upcoming that was missed entirely',
      { status: 'upcoming', windowStart: '2026-09-01', windowEnd: '2026-09-10' },
      'offer.expired',
    ],
    [
      'unverified is never touched',
      { status: 'unverified', windowStart: '2026-09-01', windowEnd: '2026-12-31' },
      null,
    ],
    [
      'evergreen is never touched',
      { status: 'evergreen', windowStart: null, windowEnd: null },
      null,
    ],
    [
      'expired back in range is an admin edit',
      { status: 'expired', windowEnd: '2026-12-31' },
      null,
    ],
  ])('%s', (_name, overrides, expected) => {
    expect(transitionFor(offer(overrides), TODAY)?.event.type ?? null).toBe(expected);
  });

  it('keys the event on the date that caused it', () => {
    const expired = transitionFor(offer({ id: 'a', windowEnd: '2026-09-28' }), TODAY);
    expect(expired?.event.idempotencyKey).toBe('a#expired#2026-09-28');
    const opened = transitionFor(offer({ id: 'a', status: 'upcoming', windowStart: TODAY }), TODAY);
    expect(opened?.event.idempotencyKey).toBe('a#opened#2026-09-29');
  });
});

describe('expiringEventFor', () => {
  it.each([
    ['2026-10-06', 7],
    ['2026-10-02', 3],
    ['2026-09-30', 1],
  ])('ending %s is %i days out', (windowEnd, daysLeft) => {
    const event = expiringEventFor(offer({ id: 'a', windowEnd }), TODAY);
    expect(event).toMatchObject({
      type: 'offer.expiring',
      idempotencyKey: `a#${windowEnd}#${String(daysLeft)}d`,
      payload: { daysLeft },
    });
  });

  it.each(['2026-10-05', '2026-10-01', TODAY, '2026-12-31'])(
    'ending %s says nothing',
    (windowEnd) => {
      expect(expiringEventFor(offer({ windowEnd }), TODAY)).toBeNull();
    },
  );

  it('ignores offers that are not counting down', () => {
    expect(expiringEventFor(offer({ windowEnd: null }), TODAY)).toBeNull();
    expect(
      expiringEventFor(offer({ status: 'unverified', windowEnd: '2026-09-30' }), TODAY),
    ).toBeNull();
  });
});

describe('runStatus', () => {
  it('does nothing while another run holds the lease', async () => {
    mock.on(PutCommand).rejects(awsError('ConditionalCheckFailedException'));
    expect(await runStatus(deps())).toMatchObject({ ran: false, offers: 0 });
  });

  it('expires an offer in one transaction and skips its liveness check', async () => {
    arrange([offer({ id: 'a', windowEnd: '2026-09-28' })]);
    const d = deps();
    expect(await runStatus(d)).toMatchObject({ ran: true, offers: 1, expired: 1 });
    const [items] = transactions();
    expect(items).toHaveLength(4);
    expect(items?.[1]?.Put?.Item).toMatchObject({ type: 'offer.expired', audience: 'public' });
    expect(items?.[2]?.Update?.ExpressionAttributeValues).toMatchObject({
      ':from': 'active',
      ':to': 'expired',
      ':gsi1sk': 'expired#2026-09-28#a',
    });
    expect(d.check).not.toHaveBeenCalled();
  });

  it('announces an offer three days from its end without changing it', async () => {
    arrange([offer({ windowEnd: '2026-10-02' })]);
    expect(await runStatus(deps())).toMatchObject({ expiring: 1, expired: 0 });
    const [items] = transactions();
    expect(items).toHaveLength(3);
    expect(items?.[1]?.Put?.Item).toMatchObject({ type: 'offer.expiring' });
  });

  it('counts nothing twice when the day is re-run', async () => {
    arrange([offer({ windowEnd: '2026-09-28' })]);
    mock
      .on(TransactWriteCommand)
      .rejects(transactionCancelled(['ConditionalCheckFailed', 'None', 'None', 'None']));
    expect(await runStatus(deps())).toMatchObject({ ran: true, expired: 0 });
  });

  it.each<[Liveness, number]>([
    ['gone', 1],
    ['changed', 1],
    ['alive', 0],
    ['unknown', 0],
    ['skipped', 0],
  ])('a source page that is %s marks %i offers unverified', async (liveness, expected) => {
    arrange([offer({ id: 'a' })]);
    expect(await runStatus(deps(liveness))).toMatchObject({ unverified: expected });
    if (expected === 1) {
      const [items] = transactions();
      expect(items?.[1]?.Put?.Item).toMatchObject({ type: 'offer.updated', audience: 'admin' });
      expect(items?.[2]?.Update?.ExpressionAttributeValues).toMatchObject({
        ':to': 'unverified',
        ':note': 'auto: source page changed or unreachable on 2026-09-29',
      });
    }
  });

  it('only checks pages for offers that are live or about to be', async () => {
    arrange([
      offer({ id: 'live' }),
      offer({ id: 'soon', status: 'upcoming', windowStart: '2026-11-01' }),
      offer({ id: 'green', status: 'evergreen', windowStart: null, windowEnd: null }),
      offer({ id: 'old', status: 'expired', windowStart: '2025-12-01', windowEnd: '2026-01-01' }),
      offer({ id: 'unsure', status: 'unverified' }),
    ]);
    const d = deps();
    await runStatus(d);
    expect(d.check.mock.calls.map(([o]) => (o as Offer).id)).toEqual(['live', 'soon']);
  });

  it('records the run and releases the lease', async () => {
    arrange([]);
    await runStatus(deps());
    expect(
      mock.commandCalls(UpdateCommand)[0]?.args[0].input.ExpressionAttributeValues,
    ).toMatchObject({
      ':v0': NOW.toISOString(),
    });
    expect(mock.commandCalls(DeleteCommand)).toHaveLength(1);
  });
});
