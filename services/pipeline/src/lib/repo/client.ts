import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export type DocClient = DynamoDBDocumentClient;

export function createDocClient(client: DynamoDBClient = new DynamoDBClient({})): DocClient {
  return DynamoDBDocumentClient.from(client, {
    // optional domain fields are simply absent on the item rather than stored as NULL
    marshallOptions: { removeUndefinedValues: true },
  });
}

const STORAGE_KEYS = new Set(['PK', 'SK', 'GSI1PK', 'GSI1SK', 'entity', 'expiresAt']);

export function stripStorageKeys(item: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(item).filter(([key]) => !STORAGE_KEYS.has(key)));
}

export function isConditionalCheckFailed(error: unknown): boolean {
  return error instanceof Error && error.name === 'ConditionalCheckFailedException';
}

export function cancellationReasons(error: unknown): string[] {
  if (!(error instanceof Error) || error.name !== 'TransactionCanceledException') return [];
  const reasons: unknown = (error as { CancellationReasons?: unknown }).CancellationReasons;
  if (!Array.isArray(reasons)) return [];
  return reasons.map((reason: unknown) => {
    const code: unknown = (reason as { Code?: unknown } | null)?.Code;
    return typeof code === 'string' ? code : 'None';
  });
}
