import {
  CANDIDATE_STAGES,
  deriveStatus,
  isUlid,
  utcIsoDate,
  type Candidate,
} from '@cert-tracker/core';
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';

import { readApiEnv } from '../lib/env.ts';
import { promoteCandidate } from '../lib/promote.ts';
import {
  candidateDecisionItem,
  createDocClient,
  decideCandidate,
  getCandidate,
  listCandidatesByStage,
  listOffers,
  newEvent,
  offerPutItem,
  writeChange,
  type DocClient,
} from '../lib/repo/index.ts';
import { flushMetrics, logger, tracer } from '../lib/telemetry.ts';

export interface ApiDeps {
  doc: DocClient;
  table: string;
  // the deployment stage, not a candidate's stage; the two words collide in this file
  deployStage: string;
  adminGroup: string;
  now: () => Date;
}

export interface ApiRequest {
  routeKey: string;
  query: Record<string, string | undefined>;
  params: Record<string, string | undefined>;
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

const ALREADY_DECIDED = 'this candidate has already been decided';

// only a candidate still waiting in review can be decided; anything else is a 404 or a 409
async function reviewable(
  candidateId: string | undefined,
  deps: ApiDeps,
): Promise<Candidate | ApiReply> {
  if (candidateId === undefined || !isUlid(candidateId)) {
    return { status: 400, body: { error: 'not a candidate id' } };
  }
  const candidate = await getCandidate(deps.doc, deps.table, candidateId);
  if (candidate === null) return { status: 404, body: { error: 'no such candidate' } };
  if (candidate.stage !== 'verified') {
    return { status: 409, body: { error: ALREADY_DECIDED, stage: candidate.stage } };
  }
  return candidate;
}

function isReply(value: Candidate | ApiReply): value is ApiReply {
  return 'status' in value && typeof value.status === 'number';
}

async function approve(candidate: Candidate, subject: string, deps: ApiDeps): Promise<ApiReply> {
  if (candidate.matchesExistingId !== null) {
    // approving it as new would publish the same promotion twice. Merging into the existing
    // offer is its own route, and until that exists the honest answer is no.
    return {
      status: 409,
      body: { error: 'this candidate updates an existing offer, and merging is not built yet' },
    };
  }
  const now = deps.now();
  const today = utcIsoDate(now);
  const existing = await listOffers(deps.doc, deps.table);
  const offer = promoteCandidate(
    candidate,
    existing,
    {
      // a person has looked at it, so it is not 'unverified'; the dates decide the rest
      status: deriveStatus({ ...candidate, status: 'active' }, today),
      verificationNote: `approved in review on ${today}`,
    },
    now,
  );
  const approved: Candidate = {
    ...candidate,
    stage: 'approved',
    decidedAt: now.toISOString(),
    decidedBy: 'admin',
  };
  const result = await writeChange(deps.doc, deps.table, {
    event: newEvent(
      {
        type: 'offer.discovered',
        audience: 'public',
        offerId: offer.id,
        candidateId: candidate.candidateId,
        idempotencyKey: `offer#${offer.id}#discovered`,
        payload: { name: offer.name, vendor: offer.vendor, status: offer.status },
      },
      now,
    ),
    writes: [
      offerPutItem(deps.table, offer),
      candidateDecisionItem(deps.table, approved, 'verified'),
    ],
    now,
  });
  if (result !== 'applied') return { status: 409, body: { error: ALREADY_DECIDED } };
  logger.info('candidate approved', {
    subject,
    candidateId: candidate.candidateId,
    offerId: offer.id,
  });
  return { status: 200, body: { offer } };
}

async function dismiss(candidate: Candidate, subject: string, deps: ApiDeps): Promise<ApiReply> {
  const dismissed: Candidate = {
    ...candidate,
    stage: 'dismissed',
    decidedAt: deps.now().toISOString(),
    decidedBy: 'admin',
  };
  // no event and no lastChangeAt touch: a dismissal changes nothing the site shows
  const result = await decideCandidate(deps.doc, deps.table, dismissed, 'verified');
  if (result !== 'applied') return { status: 409, body: { error: ALREADY_DECIDED } };
  logger.info('candidate dismissed', { subject, candidateId: candidate.candidateId });
  return { status: 200, body: { candidateId: candidate.candidateId, stage: 'dismissed' } };
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

  switch (request.routeKey) {
    case 'GET /admin/candidates': {
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
    case 'POST /admin/candidates/{id}/approve': {
      const candidate = await reviewable(request.params.id, deps);
      return isReply(candidate) ? candidate : approve(candidate, subject, deps);
    }
    case 'POST /admin/candidates/{id}/dismiss': {
      const candidate = await reviewable(request.params.id, deps);
      return isReply(candidate) ? candidate : dismiss(candidate, subject, deps);
    }
    default:
      return { status: 404, body: { error: 'no such route' } };
  }
}

let cached: Omit<ApiDeps, 'now'> | undefined;

function dependencies(): Omit<ApiDeps, 'now'> {
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
    params: event.pathParameters ?? {},
    claims: context.authorizer?.jwt?.claims ?? null,
  };
  try {
    const answer = await routeRequest(request, { ...dependencies(), now: () => new Date() });
    return reply(answer.status, answer.body);
  } catch (error) {
    // the caller gets nothing but the status; the detail belongs in the log
    logger.error('api failed', { routeKey: request.routeKey, error });
    return reply(500, { error: 'internal error' });
  } finally {
    flushMetrics();
  }
}
