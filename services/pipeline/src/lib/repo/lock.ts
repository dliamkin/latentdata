import { DeleteCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

import { ulid } from '@cert-tracker/core';

import { isConditionalCheckFailed, type DocClient } from './client.ts';
import { epochSeconds, lockKey } from './keys.ts';

export interface Lease {
  name: string;
  holder: string;
  expiresAt: number;
}

// a lease, not a mutex: it expires on its own, so a crashed invocation can't block the next
// one. Expiry is checked in the condition because TTL deletion is not timely.
export async function acquireLock(
  doc: DocClient,
  table: string,
  name: string,
  leaseSeconds: number,
  now: Date,
): Promise<Lease | null> {
  const lease: Lease = {
    name,
    holder: ulid(now.getTime()),
    expiresAt: epochSeconds(now) + leaseSeconds,
  };
  try {
    await doc.send(
      new PutCommand({
        TableName: table,
        Item: {
          ...lockKey(name),
          entity: 'LOCK',
          holder: lease.holder,
          expiresAt: lease.expiresAt,
        },
        ConditionExpression: 'attribute_not_exists(PK) OR expiresAt < :now',
        ExpressionAttributeValues: { ':now': epochSeconds(now) },
      }),
    );
    return lease;
  } catch (error) {
    if (isConditionalCheckFailed(error)) return null;
    throw error;
  }
}

export async function releaseLock(doc: DocClient, table: string, lease: Lease): Promise<void> {
  try {
    await doc.send(
      new DeleteCommand({
        TableName: table,
        Key: lockKey(lease.name),
        ConditionExpression: 'holder = :holder',
        ExpressionAttributeValues: { ':holder': lease.holder },
      }),
    );
  } catch (error) {
    // someone else holds it now because ours expired; theirs to release
    if (!isConditionalCheckFailed(error)) throw error;
  }
}
