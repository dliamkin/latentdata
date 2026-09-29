import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  TABLE,
  awsError,
  docMock,
  offer,
  source,
  transactionCancelled,
} from '../../../test/helpers.ts';
import {
  acquireLock,
  changeTransaction,
  getOffer,
  getSystemMeta,
  itemToOffer,
  listOffers,
  listPublicEventsSince,
  newEvent,
  offerStatusUpdateItem,
  offerToItem,
  putOfferIfAbsent,
  putSourceIfAbsent,
  releaseLock,
  setSystemMeta,
  sourceHealth,
  writeChange,
  writeEventOnly,
} from './index.ts';

const NOW = new Date('2026-09-29T04:17:00.000Z');
const { doc, mock } = docMock();

beforeEach(() => {
  mock.reset();
});

describe('offers', () => {
  it('round-trips an offer through its item', () => {
    const item = offerToItem(offer());
    expect(item).toMatchObject({
      PK: 'OFFER#vendor-offer-2026',
      SK: 'META',
      GSI1PK: 'OFFERS',
      GSI1SK: 'active#2026-12-31#vendor-offer-2026',
      entity: 'OFFER',
    });
    expect(itemToOffer(item)).toEqual(offer());
  });

  it('rejects an item that is not a valid offer', () => {
    expect(() => itemToOffer({ ...offerToItem(offer()), whatIsFree: 'partial' })).toThrow();
  });

  it('gets one offer, or null', async () => {
    mock
      .on(GetCommand)
      .resolvesOnce({ Item: offerToItem(offer()) })
      .resolvesOnce({});
    expect(await getOffer(doc, TABLE, 'vendor-offer-2026')).toEqual(offer());
    expect(await getOffer(doc, TABLE, 'nope')).toBeNull();
  });

  it('lists every page of the OFFERS partition', async () => {
    mock
      .on(QueryCommand)
      .resolvesOnce({ Items: [offerToItem(offer({ id: 'a' }))], LastEvaluatedKey: { PK: 'x' } })
      .resolvesOnce({ Items: [offerToItem(offer({ id: 'b' }))] });
    const offers = await listOffers(doc, TABLE);
    expect(offers.map((o) => o.id)).toEqual(['a', 'b']);
    expect(mock.commandCalls(QueryCommand)[1]?.args[0].input.ExclusiveStartKey).toEqual({
      PK: 'x',
    });
  });

  it('never overwrites on import', async () => {
    mock
      .on(PutCommand)
      .resolvesOnce({})
      .rejectsOnce(awsError('ConditionalCheckFailedException'))
      .rejectsOnce(awsError('ProvisionedThroughputExceededException'));
    expect(await putOfferIfAbsent(doc, TABLE, offer())).toBe('created');
    expect(await putOfferIfAbsent(doc, TABLE, offer())).toBe('exists');
    await expect(putOfferIfAbsent(doc, TABLE, offer())).rejects.toThrow();
  });

  it('builds a conditional status update', () => {
    const item = offerStatusUpdateItem(TABLE, {
      id: 'a',
      windowEnd: '2026-09-28',
      from: 'active',
      to: 'expired',
      updatedAt: NOW.toISOString(),
    });
    expect(item).toMatchObject({
      Update: {
        Key: { PK: 'OFFER#a', SK: 'META' },
        ConditionExpression: 'attribute_exists(PK) AND #status = :from',
        ExpressionAttributeValues: { ':to': 'expired', ':gsi1sk': 'expired#2026-09-28#a' },
      },
    });
  });
});

describe('sources', () => {
  it('imports without overwriting and counts health over enabled sources only', async () => {
    mock.on(PutCommand).resolvesOnce({}).rejectsOnce(awsError('ConditionalCheckFailedException'));
    expect(await putSourceIfAbsent(doc, TABLE, source())).toBe('created');
    expect(await putSourceIfAbsent(doc, TABLE, source())).toBe('exists');
    expect(
      sourceHealth([
        source(),
        source({ sourceId: 'b', state: { consecutiveFailures: 3 } }),
        source({ sourceId: 'c', enabled: false, state: { consecutiveFailures: 9 } }),
      ]),
    ).toEqual({ total: 2, unhealthy: 1 });
  });
});

describe('events', () => {
  it('queries the public tail from a timestamp', async () => {
    const event = newEvent(
      {
        type: 'offer.discovered',
        audience: 'public',
        idempotencyKey: 'k',
        offerId: 'a',
        payload: {},
      },
      NOW,
    );
    mock.on(QueryCommand).resolves({
      Items: [{ ...event, PK: 'EVENT#2026-09', SK: 'x', GSI1PK: 'EVENTS#public', GSI1SK: 'y' }],
    });
    const tail = await listPublicEventsSince(doc, TABLE, '2026-07-01T00:00:00.000Z');
    expect(tail).toEqual([
      {
        eventId: event.eventId,
        type: 'offer.discovered',
        occurredAt: NOW.toISOString(),
        offerId: 'a',
        payload: {},
      },
    ]);
    expect(mock.commandCalls(QueryCommand)[0]?.args[0].input.ExpressionAttributeValues).toEqual({
      ':pk': 'EVENTS#public',
      ':since': '2026-07-01T00:00:00.000Z',
    });
  });
});

describe('system meta', () => {
  it('defaults every field when the item does not exist yet', async () => {
    mock.on(GetCommand).resolves({});
    expect(await getSystemMeta(doc, TABLE)).toEqual({
      lastPollAt: null,
      lastStatusRunAt: null,
      lastPublishedAt: null,
      lastChangeAt: null,
      publishMonth: null,
      publishCountMonth: 0,
    });
  });

  it('sets only the fields it is given', async () => {
    mock.on(UpdateCommand).resolves({});
    await setSystemMeta(doc, TABLE, {});
    expect(mock.commandCalls(UpdateCommand)).toHaveLength(0);
    await setSystemMeta(doc, TABLE, { lastPublishedAt: NOW.toISOString(), publishCountMonth: 4 });
    const input = mock.commandCalls(UpdateCommand)[0]?.args[0].input;
    expect(input?.UpdateExpression).toBe('SET #f0 = :v0, #f1 = :v1, entity = :entity');
    expect(input?.ExpressionAttributeNames).toEqual({
      '#f0': 'lastPublishedAt',
      '#f1': 'publishCountMonth',
    });
  });
});

describe('lock', () => {
  it('takes a free or expired lease and refuses a live one', async () => {
    mock.on(PutCommand).resolvesOnce({}).rejectsOnce(awsError('ConditionalCheckFailedException'));
    const lease = await acquireLock(doc, TABLE, 'publish', 120, NOW);
    expect(lease).toMatchObject({ name: 'publish', expiresAt: 1_790_655_420 + 120 });
    const input = mock.commandCalls(PutCommand)[0]?.args[0].input;
    expect(input?.ConditionExpression).toBe('attribute_not_exists(PK) OR expiresAt < :now');
    expect(await acquireLock(doc, TABLE, 'publish', 120, NOW)).toBeNull();
  });

  it('releases only its own lease and shrugs when it already expired', async () => {
    mock
      .on(DeleteCommand)
      .resolvesOnce({})
      .rejectsOnce(awsError('ConditionalCheckFailedException'));
    const lease = { name: 'publish', holder: 'h', expiresAt: 1 };
    await releaseLock(doc, TABLE, lease);
    await expect(releaseLock(doc, TABLE, lease)).resolves.toBeUndefined();
    expect(mock.commandCalls(DeleteCommand)[0]?.args[0].input.ExpressionAttributeValues).toEqual({
      ':holder': 'h',
    });
  });
});

describe('change transaction', () => {
  const event = newEvent(
    {
      type: 'offer.expired',
      audience: 'public',
      idempotencyKey: 'a#expired',
      offerId: 'a',
      payload: {},
    },
    NOW,
  );
  const write = offerStatusUpdateItem(TABLE, {
    id: 'a',
    windowEnd: '2026-09-28',
    from: 'active',
    to: 'expired',
    updatedAt: NOW.toISOString(),
  });

  it('is guard, event, writes, then the lastChangeAt touch', () => {
    const items = changeTransaction(TABLE, { event, writes: [write], now: NOW });
    expect(items).toHaveLength(4);
    expect(items[0]?.Put?.Item).toMatchObject({ PK: 'EVENTKEY#a#expired' });
    expect(items[0]?.Put?.ConditionExpression).toBe('attribute_not_exists(PK)');
    expect(items[1]?.Put?.Item).toMatchObject({ PK: 'EVENT#2026-09', GSI1PK: 'EVENTS#public' });
    expect(items[2]?.Update?.Key).toEqual({ PK: 'OFFER#a', SK: 'META' });
    expect(items[3]?.Update?.Key).toEqual({ PK: 'META#system', SK: 'META' });
  });

  it('reports applied, duplicate and stale', async () => {
    mock
      .on(TransactWriteCommand)
      .resolvesOnce({})
      .rejectsOnce(transactionCancelled(['ConditionalCheckFailed', 'None', 'None', 'None']))
      .rejectsOnce(transactionCancelled(['None', 'None', 'ConditionalCheckFailed', 'None']))
      .rejectsOnce(awsError('InternalServerError'));
    const input = { event, writes: [write], now: NOW };
    expect(await writeChange(doc, TABLE, input)).toBe('applied');
    expect(await writeChange(doc, TABLE, input)).toBe('duplicate');
    expect(await writeChange(doc, TABLE, input)).toBe('stale');
    await expect(writeChange(doc, TABLE, input)).rejects.toThrow('InternalServerError');
  });

  it('writes an event on its own without touching lastChangeAt', async () => {
    mock
      .on(TransactWriteCommand)
      .resolvesOnce({})
      .rejectsOnce(transactionCancelled(['ConditionalCheckFailed', 'None']));
    expect(await writeEventOnly(doc, TABLE, event)).toBe('applied');
    expect(mock.commandCalls(TransactWriteCommand)[0]?.args[0].input.TransactItems).toHaveLength(2);
    expect(await writeEventOnly(doc, TABLE, event)).toBe('duplicate');
  });
});
