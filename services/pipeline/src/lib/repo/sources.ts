import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

import { SourceSchema, type Source } from '@cert-tracker/core';

import { isConditionalCheckFailed, stripStorageKeys, type DocClient } from './client.ts';
import { GSI1_NAME, GSI1_SOURCES, sourceGsi1, sourceKey } from './keys.ts';

// three strikes is where a source counts as unhealthy everywhere: alarms, snapshot, admin UI
export const UNHEALTHY_AFTER_FAILURES = 3;

export function sourceToItem(source: Source): Record<string, unknown> {
  return {
    ...source,
    ...sourceKey(source.sourceId),
    ...sourceGsi1(source.sourceId),
    entity: 'SOURCE',
  };
}

export function itemToSource(item: Record<string, unknown>): Source {
  return SourceSchema.parse(stripStorageKeys(item));
}

export async function putSourceIfAbsent(
  doc: DocClient,
  table: string,
  source: Source,
): Promise<'created' | 'exists'> {
  try {
    await doc.send(
      new PutCommand({
        TableName: table,
        Item: sourceToItem(source),
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );
    return 'created';
  } catch (error) {
    if (isConditionalCheckFailed(error)) return 'exists';
    throw error;
  }
}

// poll is the only writer of source state and runs single-instance behind a lease, so a
// whole-item put after read-modify-write is safe and keeps the expression trivial
export async function putSource(doc: DocClient, table: string, source: Source): Promise<void> {
  await doc.send(new PutCommand({ TableName: table, Item: sourceToItem(source) }));
}

export async function listSources(doc: DocClient, table: string): Promise<Source[]> {
  const sources: Source[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const page = await doc.send(
      new QueryCommand({
        TableName: table,
        IndexName: GSI1_NAME,
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': GSI1_SOURCES },
        ExclusiveStartKey: start,
      }),
    );
    for (const item of page.Items ?? []) sources.push(itemToSource(item));
    start = page.LastEvaluatedKey;
  } while (start !== undefined);
  return sources;
}

export function sourceHealth(sources: readonly Source[]): { total: number; unhealthy: number } {
  const enabled = sources.filter((source) => source.enabled);
  return {
    total: enabled.length,
    unhealthy: enabled.filter((s) => s.state.consecutiveFailures >= UNHEALTHY_AFTER_FAILURES)
      .length,
  };
}
