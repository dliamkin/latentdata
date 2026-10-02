import { CANDIDATE_STAGES, type Candidate } from '@cert-tracker/core';
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';

import { readApiEnv } from '../lib/env.ts';
import { createDocClient, listCandidatesByStage, type DocClient } from '../lib/repo/index.ts';
import { flushMetrics, logger, tracer } from '../lib/telemetry.ts';

export interface ApiDeps {
  doc: DocClient;
  table: string;
  // the deployment stage, not a candidate's stage; the two words collide in this file
  deployStage: string;
  adminGroup: string;
}

export interface ApiRequest {
  routeKey: string;
  query: Record<string, string | undefined>;
  // absent on the open routes, where API Gateway runs no authorizer
  claims: Record<string, unknown> | null;
}

export interface ApiReply {
  status: number;
  body: Record<string, unknown>;
}

// API Gateway flattens a multi-valued claim on its way out of the JWT authorizer, so
// cognito:groups arrives as the string '[admins]' rather than an array. Read both.
export function parseGroups(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((entry) => String(entry));
  if (typeof raw !== 'string') return [];
  return raw
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .split(/[\s,]+/)
    .filter((group) => group !== '');
}

// API Gateway has already checked the signature, issuer, audience and expiry by the time this
// runs. What is left is whether the caller is an admin, and whether it is the kind of token the
// authorizer was configured for — an access token carries client_id instead of aud, so pinning
// token_use closes the gap between what the authorizer accepts and what this route expects.
export function adminSubject(claims: Record<string, unknown> | null, group: string): string | null {
  if (claims === null) return null;
  if (claims.token_use !== 'id') return null;
  if (!parseGroups(claims['cognito:groups']).includes(group)) return null;
  const subject = claims.sub;
  return typeof subject === 'string' && subject !== '' ? subject : null;
}

function isCandidateStage(value: string): value is Candidate['stage'] {
  return (CANDIDATE_STAGES as readonly string[]).includes(value);
}

export async function routeRequest(request: ApiRequest, deps: ApiDeps): Promise<ApiReply> {
  if (request.routeKey === 'GET /health') {
    return { status: 200, body: { ok: true, stage: deps.deployStage } };
  }

  const subject = adminSubject(request.claims, deps.adminGroup);
  if (subject === null) {
    // a valid token that is not an admin's; API Gateway already answered the missing-token case
    return { status: 403, body: { error: 'not an admin' } };
  }

  if (request.routeKey === 'GET /admin/candidates') {
    const candidateStage = request.query.stage ?? 'verified';
    if (!isCandidateStage(candidateStage)) {
      return {
        status: 400,
        body: { error: `stage must be one of ${CANDIDATE_STAGES.join(', ')}` },
      };
    }
    const candidates = await listCandidatesByStage(deps.doc, deps.table, candidateStage);
    logger.info('candidates read', { subject, stage: candidateStage, count: candidates.length });
    return { status: 200, body: { candidates, count: candidates.length } };
  }

  return { status: 404, body: { error: 'no such route' } };
}

let cached: ApiDeps | undefined;

function dependencies(): ApiDeps {
  if (cached !== undefined) return cached;
  const env = readApiEnv();
  cached = {
    doc: tracer.captureAWSv3Client(createDocClient()),
    table: env.tableName,
    deployStage: env.stage,
    adminGroup: env.adminGroup,
  };
  return cached;
}

function reply(status: number, body: Record<string, unknown>): APIGatewayProxyResultV2 {
  return {
    statusCode: status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export async function handler(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  // API Gateway leaves requestContext.authorizer out entirely on the open routes, which the
  // bundled APIGatewayProxyEventV2WithJWTAuthorizer type does not admit to
  const context = event.requestContext as {
    authorizer?: { jwt?: { claims?: Record<string, string> } };
  };
  const request: ApiRequest = {
    routeKey: event.routeKey,
    query: event.queryStringParameters ?? {},
    claims: context.authorizer?.jwt?.claims ?? null,
  };
  try {
    const answer = await routeRequest(request, dependencies());
    return reply(answer.status, answer.body);
  } catch (error) {
    // the caller gets nothing but the status; the detail belongs in the log
    logger.error('api failed', { routeKey: request.routeKey, error });
    return reply(500, { error: 'internal error' });
  } finally {
    flushMetrics();
  }
}
