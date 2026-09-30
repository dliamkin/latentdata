import { BatchGetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import { SignalSchema, type Signal } from '@cert-tracker/core';

import { isConditionalCheckFailed, stripStorageKeys, type DocClient } from './client.ts';
import { GSI1_NAME, deferredSignalGsi1, signalKey, ttlAfterDays } from './keys.ts';

export const SIGNAL_TTL_DAYS = 120;
const BATCH_GET_MAX = 100;

export function signalToItem(signal: Signal, now: Date): Record<string, unknown> {
  return {
    ...signal,
    ...signalKey(signal.sourceId, signal.fingerprint),
    ...(signal.state === 'deferred' && signal.deferredAt !== undefined
      ? deferredSignalGsi1(signal.seenAt)
      : {}),
    entity: 'SIGNAL',
    expiresAt: ttlAfterDays(now, SIGNAL_TTL_DAYS),
  };
}

export function itemToSignal(item: Record<string, unknown>): Signal {
  return SignalSchema.parse(stripStorageKeys(item));
}

// which of these fingerprints the table already holds for the source; the seen-check that
// keeps the LLM from ever looking at the same item twice
export async function seenFingerprints(
  doc: DocClient,
  table: string,
  sourceId: string,
  fingerprints: readonly string[],
): Promise<Set<string>> {
  const seen = new Set<string>();
  for (let i = 0; i < fingerprints.length; i += BATCH_GET_MAX) {
    let pending: Record<string, unknown>[] = fingerprints
      .slice(i, i + BATCH_GET_MAX)
      .map((fp) => ({ ...signalKey(sourceId, fp) }));
    while (pending.length > 0) {
      const result = await doc.send(
        new BatchGetCommand({
          RequestItems: { [table]: { Keys: pending, ProjectionExpression: 'SK' } },
        }),
      );
      for (const item of result.Responses?.[table] ?? []) {
        if (typeof item.SK === 'string') seen.add(item.SK);
      }
      // DynamoDB may hand some keys back unread under load; ask again until it doesn't
      pending = result.UnprocessedKeys?.[table]?.Keys ?? [];
    }
  }
  return seen;
}

export async function putSignalIfAbsent(
  doc: DocClient,
  table: string,
  signal: Signal,
  now: Date,
): Promise<'created' | 'exists'> {
  try {
    await doc.send(
      new PutCommand({
        TableName: table,
        Item: signalToItem(signal, now),
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );
    return 'created';
  } catch (error) {
    if (isConditionalCheckFailed(error)) return 'exists';
    throw error;
  }
}

export async function setSignalTriage(
  doc: DocClient,
  table: string,
  sourceId: string,
  fingerprint: string,
  triage: NonNullable<Signal['triage']>,
): Promise<void> {
  await doc.send(
    new UpdateCommand({
      TableName: table,
      Key: signalKey(sourceId, fingerprint),
      UpdateExpression: 'SET #state = :state, triage = :triage',
      ExpressionAttributeNames: { '#state': 'state' },
      ExpressionAttributeValues: { ':state': 'triaged', ':triage': triage },
    }),
  );
}

export async function setSignalState(
  doc: DocClient,
  table: string,
  sourceId: string,
  fingerprint: string,
  state: Signal['state'],
): Promise<void> {
  await doc.send(
    new UpdateCommand({
      TableName: table,
      Key: signalKey(sourceId, fingerprint),
      UpdateExpression: 'SET #state = :state',
      ExpressionAttributeNames: { '#state': 'state' },
      ExpressionAttributeValues: { ':state': state },
    }),
  );
}

// parks a signal the budget guard refused; the sparse index entry is what lets poll find it
// again without a Scan
export async function deferSignal(
  doc: DocClient,
  table: string,
  signal: Pick<Signal, 'sourceId' | 'fingerprint' | 'seenAt'>,
  stage: 'triage' | 'verify',
  now: Date,
): Promise<void> {
  await doc.send(
    new UpdateCommand({
      TableName: table,
      Key: signalKey(signal.sourceId, signal.fingerprint),
      UpdateExpression:
        'SET #state = :state, deferredAt = :at, deferredStage = :stage, GSI1PK = :pk, GSI1SK = :sk',
      ExpressionAttributeNames: { '#state': 'state' },
      ExpressionAttributeValues: {
        ':state': 'deferred',
        ':at': now.toISOString(),
        ':stage': stage,
        ...Object.fromEntries(
          Object.entries(deferredSignalGsi1(signal.seenAt)).map(([k, v]) => [
            `:${k.toLowerCase()}`,
            v,
          ]),
        ),
      },
    }),
  );
}

export async function listDeferredSignals(doc: DocClient, table: string): Promise<Signal[]> {
  const signals: Signal[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const page = await doc.send(
      new QueryCommand({
        TableName: table,
        IndexName: GSI1_NAME,
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': deferredSignalGsi1('').GSI1PK },
        ExclusiveStartKey: start,
      }),
    );
    for (const item of page.Items ?? []) signals.push(itemToSignal(item));
    start = page.LastEvaluatedKey;
  } while (start !== undefined);
  return signals;
}

export async function requeueSignal(
  doc: DocClient,
  table: string,
  signal: Pick<Signal, 'sourceId' | 'fingerprint'>,
): Promise<void> {
  await doc.send(
    new UpdateCommand({
      TableName: table,
      Key: signalKey(signal.sourceId, signal.fingerprint),
      UpdateExpression: 'SET #state = :state REMOVE GSI1PK, GSI1SK, deferredAt, deferredStage',
      ExpressionAttributeNames: { '#state': 'state' },
      ExpressionAttributeValues: { ':state': 'queued' },
    }),
  );
}
