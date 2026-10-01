import { DeleteCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

import { CatalogEntrySchema, type CatalogEntry } from '@cert-tracker/core';

import { stripStorageKeys, type DocClient } from './client.ts';
import { GSI1_CATALOG, GSI1_NAME, catalogGsi1, catalogKey } from './keys.ts';

export function catalogEntryToItem(entry: CatalogEntry): Record<string, unknown> {
  return {
    ...entry,
    ...catalogKey(entry.id),
    ...catalogGsi1(entry.category, entry.rank, entry.id),
    entity: 'CATALOG',
  };
}

export function itemToCatalogEntry(item: Record<string, unknown>): CatalogEntry {
  return CatalogEntrySchema.parse(stripStorageKeys(item));
}

export async function listCatalog(doc: DocClient, table: string): Promise<CatalogEntry[]> {
  const entries: CatalogEntry[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const page = await doc.send(
      new QueryCommand({
        TableName: table,
        IndexName: GSI1_NAME,
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': GSI1_CATALOG },
        ExclusiveStartKey: start,
      }),
    );
    for (const item of page.Items ?? []) entries.push(itemToCatalogEntry(item));
    start = page.LastEvaluatedKey;
  } while (start !== undefined);
  return entries;
}

// unlike offers, the catalog is edited in the seed file and re-imported, so the importer
// overwrites and deletes; nothing else writes these items
export async function putCatalogEntry(
  doc: DocClient,
  table: string,
  entry: CatalogEntry,
): Promise<void> {
  await doc.send(new PutCommand({ TableName: table, Item: catalogEntryToItem(entry) }));
}

export async function deleteCatalogEntry(doc: DocClient, table: string, id: string): Promise<void> {
  await doc.send(new DeleteCommand({ TableName: table, Key: catalogKey(id) }));
}
