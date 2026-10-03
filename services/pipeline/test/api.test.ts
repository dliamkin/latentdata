import { GetCommand, PutCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Candidate } from '@cert-tracker/core';

import {
  adminSubject,
  parseGroups,
  routeRequest,
  type ApiDeps,
  type ApiRequest,
} from '../src/handlers/api.ts';
import { candidateToItem } from '../src/lib/repo/candidates.ts';
import { TABLE, awsError, candidate, docMock, transactionCancelled } from './helpers.ts';

const ADMIN_GROUP = 'admins';
const { doc, mock } = docMock();

const NOW = new Date('2026-10-02T09:30:00.000Z');
const CANDIDATE_ID = '01J9Z0G6V2QK8X7N3B4C5D6E7F';
const deps: ApiDeps = {
  doc,
  table: TABLE,
  deployStage: 'test',
  adminGroup: ADMIN_GROUP,
  now: () => NOW,
};

// what API Gateway hands over once the authorizer has accepted my ID token
function adminClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sub: 'a8f1c2d3-0000-4000-8000-000000000001',
    token_use: 'id',
    'cognito:groups': `[${ADMIN_GROUP}]`,
    ...overrides,
  };
}

function request(overrides: Partial<ApiRequest> = {}): ApiRequest {
  return {
    routeKey: 'GET /admin/candidates',
    query: {},
    params: {},
    claims: adminClaims(),
    ...overrides,
  };
}

beforeEach(() => {
  mock.reset();
});

describe('parseGroups', () => {
  it('reads the bracketed string API Gateway actually sends', () => {
    expect(parseGroups('[admins]')).toEqual(['admins']);
    expect(parseGroups('[admins owners]')).toEqual(['admins', 'owners']);
  });

  it('reads an array and a comma separated list', () => {
    expect(parseGroups(['admins', 'owners'])).toEqual(['admins', 'owners']);
    expect(parseGroups('admins,owners')).toEqual(['admins', 'owners']);
  });

  it('is empty for a missing or unusable claim', () => {
    expect(parseGroups(undefined)).toEqual([]);
    expect(parseGroups('[]')).toEqual([]);
    expect(parseGroups(42)).toEqual([]);
  });
});

describe('adminSubject', () => {
  it('returns the subject for an admin ID token', () => {
    expect(adminSubject(adminClaims(), ADMIN_GROUP)).toBe('a8f1c2d3-0000-4000-8000-000000000001');
  });

  it('refuses a token that is not in the group', () => {
    expect(adminSubject(adminClaims({ 'cognito:groups': '[]' }), ADMIN_GROUP)).toBeNull();
  });

  it('refuses an access token even when the group is right', () => {
    expect(adminSubject(adminClaims({ token_use: 'access' }), ADMIN_GROUP)).toBeNull();
  });

  it('refuses a claim set with no subject', () => {
    expect(adminSubject(adminClaims({ sub: '' }), ADMIN_GROUP)).toBeNull();
  });
});

describe('routeRequest', () => {
  it('answers health without any claims', async () => {
    const reply = await routeRequest(
      { routeKey: 'GET /health', query: {}, params: {}, claims: null },
      deps,
    );
    expect(reply).toEqual({ status: 200, body: { ok: true, stage: 'test' } });
  });

  it('refuses an admin route when the authorizer passed no claims', async () => {
    const reply = await routeRequest(request({ claims: null }), deps);
    expect(reply.status).toBe(403);
  });

  it('refuses a signed-in user who is not in the admin group', async () => {
    const reply = await routeRequest(
      request({ claims: adminClaims({ 'cognito:groups': '[readers]' }) }),
      deps,
    );
    expect(reply.status).toBe(403);
  });

  it('returns the verified candidates by default', async () => {
    mock.on(QueryCommand).resolves({ Items: [candidateToItem(candidate())] });
    const reply = await routeRequest(request(), deps);
    expect(reply.status).toBe(200);
    expect(reply.body.count).toBe(1);
    expect((reply.body.candidates as Candidate[])[0]?.candidateId).toBe(
      '01J9Z0G6V2QK8X7N3B4C5D6E7F',
    );
  });

  it('reads the stage from the query string', async () => {
    mock.on(QueryCommand).resolves({ Items: [] });
    const reply = await routeRequest(request({ query: { stage: 'dismissed' } }), deps);
    expect(reply.status).toBe(200);
    const sent = mock.commandCalls(QueryCommand)[0]?.args[0].input;
    expect(sent?.ExpressionAttributeValues?.[':pk']).toContain('dismissed');
  });

  it('rejects a stage that is not a candidate stage', async () => {
    const reply = await routeRequest(request({ query: { stage: 'wishful' } }), deps);
    expect(reply.status).toBe(400);
    expect(mock.commandCalls(QueryCommand)).toHaveLength(0);
  });

  it('404s an unknown route rather than falling through', async () => {
    const reply = await routeRequest(request({ routeKey: 'GET /admin/nothing' }), deps);
    expect(reply.status).toBe(404);
  });
});

interface TransactPut {
  Put?: { Item: Record<string, unknown>; ConditionExpression?: string };
}

function transactPuts(): Record<string, unknown>[] {
  const input = mock.commandCalls(TransactWriteCommand)[0]?.args[0].input;
  return ((input?.TransactItems ?? []) as TransactPut[])
    .map((item) => item.Put?.Item)
    .filter((item): item is Record<string, unknown> => item !== undefined);
}

describe('approving a candidate', () => {
  const approve = (overrides: Partial<ApiRequest> = {}): ApiRequest =>
    request({
      routeKey: 'POST /admin/candidates/{id}/approve',
      params: { id: CANDIDATE_ID },
      ...overrides,
    });

  it('writes the offer and the decided candidate in one transaction', async () => {
    mock.on(GetCommand).resolves({ Item: candidateToItem(candidate()) });
    mock.on(QueryCommand).resolves({ Items: [] });
    mock.on(TransactWriteCommand).resolves({});
    const reply = await routeRequest(approve(), deps);
    expect(reply.status).toBe(200);
    expect(reply.body.offer).toMatchObject({
      id: 'vendor-free-exam-2026',
      // a person looked at it, so the dates decide the status rather than 'unverified'
      status: 'active',
      addedBy: 'scan',
      verificationNote: 'approved in review on 2026-10-02',
    });
    const puts = transactPuts();
    expect(puts.find((item) => item.entity === 'OFFER')).toMatchObject({
      id: 'vendor-free-exam-2026',
    });
    expect(puts.find((item) => item.entity === 'CANDIDATE')).toMatchObject({
      candidateId: CANDIDATE_ID,
      stage: 'approved',
      decidedBy: 'admin',
      decidedAt: NOW.toISOString(),
    });
  });

  it('marks an offer whose window has not opened as upcoming', async () => {
    mock
      .on(GetCommand)
      .resolves({ Item: candidateToItem(candidate({ windowStart: '2026-11-01' })) });
    mock.on(QueryCommand).resolves({ Items: [] });
    mock.on(TransactWriteCommand).resolves({});
    const reply = await routeRequest(approve(), deps);
    expect(reply.body.offer).toMatchObject({ status: 'upcoming' });
  });

  it('refuses a candidate that updates an existing offer rather than publish it twice', async () => {
    mock.on(GetCommand).resolves({
      Item: candidateToItem(candidate({ matchesExistingId: 'vendor-offer-2026' })),
    });
    const reply = await routeRequest(approve(), deps);
    expect(reply.status).toBe(409);
    expect(mock.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  it('refuses a candidate that was already decided', async () => {
    mock.on(GetCommand).resolves({ Item: candidateToItem(candidate({ stage: 'dismissed' })) });
    const reply = await routeRequest(approve(), deps);
    expect(reply).toMatchObject({ status: 409, body: { stage: 'dismissed' } });
    expect(mock.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  it('answers 409 when another tab decided it between the read and the write', async () => {
    mock.on(GetCommand).resolves({ Item: candidateToItem(candidate()) });
    mock.on(QueryCommand).resolves({ Items: [] });
    mock
      .on(TransactWriteCommand)
      .rejects(transactionCancelled(['None', 'None', 'None', 'ConditionalCheckFailed', 'None']));
    const reply = await routeRequest(approve(), deps);
    expect(reply.status).toBe(409);
  });

  it('404s an unknown candidate and 400s an id that is not one', async () => {
    mock.on(GetCommand).resolves({});
    expect((await routeRequest(approve(), deps)).status).toBe(404);
    expect((await routeRequest(approve({ params: { id: '../offers' } }), deps)).status).toBe(400);
  });

  it('is refused without the admin group before anything is read', async () => {
    const reply = await routeRequest(
      approve({ claims: adminClaims({ 'cognito:groups': '[]' }) }),
      deps,
    );
    expect(reply.status).toBe(403);
    expect(mock.commandCalls(GetCommand)).toHaveLength(0);
  });
});

describe('dismissing a candidate', () => {
  const dismiss = (): ApiRequest =>
    request({ routeKey: 'POST /admin/candidates/{id}/dismiss', params: { id: CANDIDATE_ID } });

  it('moves it to dismissed, conditional on it still being in review', async () => {
    mock.on(GetCommand).resolves({ Item: candidateToItem(candidate()) });
    mock.on(PutCommand).resolves({});
    const reply = await routeRequest(dismiss(), deps);
    expect(reply).toEqual({
      status: 200,
      body: { candidateId: CANDIDATE_ID, stage: 'dismissed' },
    });
    const put = mock.commandCalls(PutCommand)[0]?.args[0].input;
    expect(put?.Item).toMatchObject({ stage: 'dismissed', decidedBy: 'admin' });
    expect(put?.ConditionExpression).toBe('#stage = :from');
    expect(put?.ExpressionAttributeValues).toEqual({ ':from': 'verified' });
    // a dismissal changes nothing the site shows, so it must not wake the publisher
    expect(mock.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  it('answers 409 when the condition fails', async () => {
    mock.on(GetCommand).resolves({ Item: candidateToItem(candidate()) });
    mock.on(PutCommand).rejects(awsError('ConditionalCheckFailedException'));
    const reply = await routeRequest(dismiss(), deps);
    expect(reply.status).toBe(409);
  });
});
