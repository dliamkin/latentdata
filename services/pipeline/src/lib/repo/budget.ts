import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';

import type { DocClient } from './client.ts';
import { budgetKey, ttlAfterDays } from './keys.ts';

const BUDGET_TTL_DAYS = 45;

const DailyBudgetSchema = z.object({
  tokensIn: z.number().int().min(0).default(0),
  tokensOut: z.number().int().min(0).default(0),
  costMicroUsd: z.number().int().min(0).default(0),
  calls: z.number().int().min(0).default(0),
});

export type DailyBudget = z.infer<typeof DailyBudgetSchema>;

export async function getDailyBudget(
  doc: DocClient,
  table: string,
  date: string,
): Promise<DailyBudget> {
  const result = await doc.send(new GetCommand({ TableName: table, Key: budgetKey(date) }));
  return DailyBudgetSchema.parse(result.Item ?? {});
}

// atomic ADDs, so concurrent triage and verify invocations can't lose each other's spend
export async function addDailyUsage(
  doc: DocClient,
  table: string,
  date: string,
  usage: Omit<DailyBudget, 'calls'>,
  now: Date,
): Promise<void> {
  await doc.send(
    new UpdateCommand({
      TableName: table,
      Key: budgetKey(date),
      UpdateExpression:
        'ADD tokensIn :in, tokensOut :out, costMicroUsd :cost, calls :one ' +
        'SET entity = :entity, expiresAt = if_not_exists(expiresAt, :ttl)',
      ExpressionAttributeValues: {
        ':in': usage.tokensIn,
        ':out': usage.tokensOut,
        ':cost': usage.costMicroUsd,
        ':one': 1,
        ':entity': 'BUDGET',
        ':ttl': ttlAfterDays(now, BUDGET_TTL_DAYS),
      },
    }),
  );
}
