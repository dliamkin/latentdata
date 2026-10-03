import { GetCommand, PutCommand, QueryCommand, type PutCommandInput } from '@aws-sdk/lib-dynamodb';

import { CandidateSchema, type Candidate } from '@cert-tracker/core';

import { isConditionalCheckFailed, stripStorageKeys, type DocClient } from './client.ts';
import { GSI1_NAME, candidateGsi1, candidateKey } from './keys.ts';

export function candidateToItem(candidate: Candidate): Record<string, unknown> {
  return {
    ...candidate,
    ...candidateKey(candidate.candidateId),
    ...candidateGsi1(candidate.stage, candidate.createdAt),
    entity: 'CANDIDATE',
  };
}

export function itemToCandidate(item: Record<string, unknown>): Candidate {
  return CandidateSchema.parse(stripStorageKeys(item));
}

export async function putCandidateIfAbsent(
  doc: DocClient,
  table: string,
  candidate: Candidate,
): Promise<'created' | 'exists'> {
  try {
    await doc.send(
      new PutCommand({
        TableName: table,
        Item: candidateToItem(candidate),
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );
    return 'created';
  } catch (error) {
    if (isConditionalCheckFailed(error)) return 'exists';
    throw error;
  }
}

// a Put for a transaction: the auto-accept path writes the candidate and the offer together
export function candidatePutItem(table: string, candidate: Candidate): Record<string, unknown> {
  return {
    Put: {
      TableName: table,
      Item: candidateToItem(candidate),
      ConditionExpression: 'attribute_not_exists(PK)',
    },
  };
}

export async function listCandidatesByStage(
  doc: DocClient,
  table: string,
  stage: Candidate['stage'],
): Promise<Candidate[]> {
  const candidates: Candidate[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const page = await doc.send(
      new QueryCommand({
        TableName: table,
        IndexName: GSI1_NAME,
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': candidateGsi1(stage, '').GSI1PK },
        ExclusiveStartKey: start,
      }),
    );
    for (const item of page.Items ?? []) candidates.push(itemToCandidate(item));
    start = page.LastEvaluatedKey;
  } while (start !== undefined);
  return candidates;
}

export async function getCandidate(
  doc: DocClient,
  table: string,
  candidateId: string,
): Promise<Candidate | null> {
  const result = await doc.send(
    new GetCommand({ TableName: table, Key: candidateKey(candidateId) }),
  );
  return result.Item === undefined ? null : itemToCandidate(result.Item);
}

// a Put for a transaction that moves a candidate on from `from`. The condition is what stops two
// tabs, or a retried request, from deciding the same candidate twice.
export function candidateDecisionItem(
  table: string,
  decided: Candidate,
  from: Candidate['stage'],
): Record<string, unknown> {
  return {
    Put: {
      TableName: table,
      Item: candidateToItem(decided),
      ConditionExpression: '#stage = :from',
      ExpressionAttributeNames: { '#stage': 'stage' },
      ExpressionAttributeValues: { ':from': from },
    },
  };
}

// the same move on its own, for a decision that changes nothing the site shows
export async function decideCandidate(
  doc: DocClient,
  table: string,
  decided: Candidate,
  from: Candidate['stage'],
): Promise<'applied' | 'stale'> {
  const { Put } = candidateDecisionItem(table, decided, from) as { Put: PutCommandInput };
  try {
    await doc.send(new PutCommand(Put));
    return 'applied';
  } catch (error) {
    if (isConditionalCheckFailed(error)) return 'stale';
    throw error;
  }
}
