import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import {
  OfferSchema,
  type CostToYou,
  type Offer,
  type OfferStatus,
  type Technology,
  type Track,
} from '@cert-tracker/core';

import { isConditionalCheckFailed, stripStorageKeys, type DocClient } from './client.ts';
import { GSI1_NAME, GSI1_OFFERS, offerGsi1, offerKey } from './keys.ts';

export function offerToItem(offer: Offer): Record<string, unknown> {
  return {
    ...offer,
    ...offerKey(offer.id),
    ...offerGsi1(offer.status, offer.windowEnd, offer.id),
    entity: 'OFFER',
  };
}

export function itemToOffer(item: Record<string, unknown>): Offer {
  return OfferSchema.parse(stripStorageKeys(item));
}

export async function getOffer(doc: DocClient, table: string, id: string): Promise<Offer | null> {
  const result = await doc.send(new GetCommand({ TableName: table, Key: offerKey(id) }));
  return result.Item === undefined ? null : itemToOffer(result.Item);
}

export async function listOffers(doc: DocClient, table: string): Promise<Offer[]> {
  const offers: Offer[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const page = await doc.send(
      new QueryCommand({
        TableName: table,
        IndexName: GSI1_NAME,
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': GSI1_OFFERS },
        ExclusiveStartKey: start,
      }),
    );
    for (const item of page.Items ?? []) offers.push(itemToOffer(item));
    start = page.LastEvaluatedKey;
  } while (start !== undefined);
  return offers;
}

// the importer's write: never overwrites, so running it twice changes nothing
export async function putOfferIfAbsent(
  doc: DocClient,
  table: string,
  offer: Offer,
): Promise<'created' | 'exists'> {
  try {
    await doc.send(
      new PutCommand({
        TableName: table,
        Item: offerToItem(offer),
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );
    return 'created';
  } catch (error) {
    if (isConditionalCheckFailed(error)) return 'exists';
    throw error;
  }
}

// the importer's backfill for offers stored before the taxonomy existed
export async function setOfferTaxonomy(
  doc: DocClient,
  table: string,
  id: string,
  taxonomy: { tracks: Track[]; technologies: Technology[] },
  now: Date,
): Promise<void> {
  await doc.send(
    new UpdateCommand({
      TableName: table,
      Key: offerKey(id),
      UpdateExpression: 'SET tracks = :tracks, technologies = :technologies, updatedAt = :now',
      ConditionExpression: 'attribute_exists(PK)',
      ExpressionAttributeValues: {
        ':tracks': taxonomy.tracks,
        ':technologies': taxonomy.technologies,
        ':now': now.toISOString(),
      },
    }),
  );
}

// a Put for a transaction: the auto-accept path creates the offer alongside its candidate
export async function setOfferCostToYou(
  doc: DocClient,
  table: string,
  id: string,
  costToYou: CostToYou,
  now: Date,
): Promise<void> {
  await doc.send(
    new UpdateCommand({
      TableName: table,
      Key: offerKey(id),
      UpdateExpression: 'SET costToYou = :cost, updatedAt = :now',
      // only fills a gap: a value set since the plan was made stays
      ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(costToYou)',
      ExpressionAttributeValues: { ':cost': costToYou, ':now': now.toISOString() },
    }),
  );
}

export function offerPutItem(table: string, offer: Offer): Record<string, unknown> {
  return {
    Put: {
      TableName: table,
      Item: offerToItem(offer),
      ConditionExpression: 'attribute_not_exists(PK)',
    },
  };
}

export interface OfferStatusChange {
  id: string;
  windowEnd: string | null;
  from: OfferStatus;
  to: OfferStatus;
  updatedAt: string;
  verificationNote?: string;
}

// an Update item for a transaction; the condition makes a retried invocation a no-op
export function offerStatusUpdateItem(
  table: string,
  change: OfferStatusChange,
): Record<string, unknown> {
  const names: Record<string, string> = { '#status': 'status' };
  const values: Record<string, unknown> = {
    ':to': change.to,
    ':from': change.from,
    ':gsi1sk': offerGsi1(change.to, change.windowEnd, change.id).GSI1SK,
    ':updatedAt': change.updatedAt,
  };
  let update = 'SET #status = :to, GSI1SK = :gsi1sk, updatedAt = :updatedAt';
  if (change.verificationNote !== undefined) {
    update += ', verificationNote = :note';
    values[':note'] = change.verificationNote;
  }
  return {
    Update: {
      TableName: table,
      Key: offerKey(change.id),
      UpdateExpression: update,
      ConditionExpression: 'attribute_exists(PK) AND #status = :from',
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    },
  };
}
