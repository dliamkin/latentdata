import { QueryCommand } from '@aws-sdk/lib-dynamodb';

import {
  EventSchema,
  SnapshotEventSchema,
  ulid,
  type Event,
  type EventType,
  type SnapshotEvent,
} from '@cert-tracker/core';

import { stripStorageKeys, type DocClient } from './client.ts';
import { GSI1_NAME, eventGsi1, eventIdempotencyKey, eventKey, eventsGsi1Pk } from './keys.ts';

export interface NewEvent {
  type: EventType;
  idempotencyKey: string;
  audience: Event['audience'];
  payload: Record<string, unknown>;
  offerId?: string;
  candidateId?: string;
}

export function newEvent(input: NewEvent, now: Date): Event {
  return EventSchema.parse({
    eventId: ulid(now.getTime()),
    occurredAt: now.toISOString(),
    ...input,
  });
}

// two puts that travel together in a transaction: the event, and the guard that makes a second
// event with the same idempotency key fail the whole transaction
export function eventWriteItems(table: string, event: Event): Record<string, unknown>[] {
  return [
    {
      Put: {
        TableName: table,
        Item: {
          ...eventIdempotencyKey(event.idempotencyKey),
          entity: 'EVENTKEY',
          eventId: event.eventId,
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    },
    {
      Put: {
        TableName: table,
        Item: {
          ...event,
          ...eventKey(event.occurredAt, event.eventId),
          ...eventGsi1(event.audience, event.occurredAt),
          entity: 'EVENT',
        },
      },
    },
  ];
}

// index of the idempotency guard inside a transaction built with eventWriteItems first
export const EVENT_GUARD_OFFSET = 0;

export async function listPublicEventsSince(
  doc: DocClient,
  table: string,
  sinceIso: string,
): Promise<SnapshotEvent[]> {
  const events: SnapshotEvent[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const page = await doc.send(
      new QueryCommand({
        TableName: table,
        IndexName: GSI1_NAME,
        KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK >= :since',
        ExpressionAttributeValues: { ':pk': eventsGsi1Pk('public'), ':since': sinceIso },
        ExclusiveStartKey: start,
      }),
    );
    for (const item of page.Items ?? []) {
      events.push(SnapshotEventSchema.parse(stripStorageKeys(item)));
    }
    start = page.LastEvaluatedKey;
  } while (start !== undefined);
  return events;
}
