import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';

import type { DocClient } from './client.ts';
import { systemMetaKey } from './keys.ts';

const timestamp = z.iso.datetime();

const SystemMetaSchema = z.object({
  lastPollAt: timestamp.nullable().default(null),
  lastStatusRunAt: timestamp.nullable().default(null),
  lastPublishedAt: timestamp.nullable().default(null),
  lastChangeAt: timestamp.nullable().default(null),
  // commits made in `publishMonth` (YYYY-MM); the counter resets when the month rolls over
  publishMonth: z.string().nullable().default(null),
  publishCountMonth: z.number().int().min(0).default(0),
});

export type SystemMeta = z.infer<typeof SystemMetaSchema>;
export type SystemMetaField = keyof SystemMeta;

export async function getSystemMeta(doc: DocClient, table: string): Promise<SystemMeta> {
  const result = await doc.send(new GetCommand({ TableName: table, Key: systemMetaKey() }));
  return SystemMetaSchema.parse(result.Item ?? {});
}

export async function setSystemMeta(
  doc: DocClient,
  table: string,
  fields: Partial<SystemMeta>,
): Promise<void> {
  const entries = Object.entries(fields);
  if (entries.length === 0) return;
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const sets = entries.map(([key, value], index) => {
    names[`#f${String(index)}`] = key;
    values[`:v${String(index)}`] = value;
    return `#f${String(index)} = :v${String(index)}`;
  });
  await doc.send(
    new UpdateCommand({
      TableName: table,
      Key: systemMetaKey(),
      UpdateExpression: `SET ${sets.join(', ')}, entity = :entity`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: { ...values, ':entity': 'META' },
    }),
  );
}

// rides in every transaction that changes what the site shows; the publisher compares it with
// lastPublishedAt to decide whether there is anything to do
export function touchLastChangeItem(table: string, now: Date): Record<string, unknown> {
  return {
    Update: {
      TableName: table,
      Key: systemMetaKey(),
      UpdateExpression: 'SET lastChangeAt = :now, entity = :entity',
      ExpressionAttributeValues: { ':now': now.toISOString(), ':entity': 'META' },
    },
  };
}
