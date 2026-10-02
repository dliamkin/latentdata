import { QueryCommand } from '@aws-sdk/lib-dynamodb';
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
import { TABLE, candidate, docMock } from './helpers.ts';

const ADMIN_GROUP = 'admins';
const { doc, mock } = docMock();

const deps: ApiDeps = { doc, table: TABLE, deployStage: 'test', adminGroup: ADMIN_GROUP };

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
  return { routeKey: 'GET /admin/candidates', query: {}, claims: adminClaims(), ...overrides };
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
    const reply = await routeRequest({ routeKey: 'GET /health', query: {}, claims: null }, deps);
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
