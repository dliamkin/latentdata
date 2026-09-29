import { TransactWriteCommand, type TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';

import type { Event } from '@cert-tracker/core';

import { cancellationReasons, type DocClient } from './client.ts';
import { EVENT_GUARD_OFFSET, eventWriteItems } from './events.ts';
import { touchLastChangeItem } from './meta.ts';

type TransactItems = NonNullable<TransactWriteCommandInput['TransactItems']>;

export type ChangeResult = 'applied' | 'duplicate' | 'stale';

export interface ChangeInput {
  event: Event;
  // Put/Update items for the entities the event is about; empty for an event with no write
  writes?: Record<string, unknown>[];
  now: Date;
}

// the one way state changes are written: event + idempotency guard + entity writes + the
// lastChangeAt touch, all or nothing. Nobody assembles this by hand, so nobody forgets a part.
export function changeTransaction(table: string, input: ChangeInput): TransactItems {
  return [
    ...eventWriteItems(table, input.event),
    ...(input.writes ?? []),
    touchLastChangeItem(table, input.now),
  ] as TransactItems;
}

// for events that record something but change nothing the site shows (publish.completed,
// source.unhealthy): same idempotency guard, no lastChangeAt touch, so they can't trigger a publish
export async function writeEventOnly(
  doc: DocClient,
  table: string,
  event: Event,
): Promise<ChangeResult> {
  try {
    await doc.send(new TransactWriteCommand({ TransactItems: eventWriteItems(table, event) }));
    return 'applied';
  } catch (error) {
    if (cancellationReasons(error)[EVENT_GUARD_OFFSET] === 'ConditionalCheckFailed') {
      return 'duplicate';
    }
    throw error;
  }
}

export async function writeChange(
  doc: DocClient,
  table: string,
  input: ChangeInput,
): Promise<ChangeResult> {
  try {
    await doc.send(new TransactWriteCommand({ TransactItems: changeTransaction(table, input) }));
    return 'applied';
  } catch (error) {
    const reasons = cancellationReasons(error);
    if (reasons.length === 0) throw error;
    // the guard failing means this exact change was already written by an earlier attempt
    if (reasons[EVENT_GUARD_OFFSET] === 'ConditionalCheckFailed') return 'duplicate';
    // an entity condition failing means the item moved on since we read it
    if (reasons.includes('ConditionalCheckFailed')) return 'stale';
    throw error;
  }
}
