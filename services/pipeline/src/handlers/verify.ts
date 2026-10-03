import type { SQSBatchResponse, SQSEvent } from 'aws-lambda';

import {
  CandidateSchema,
  VENDOR_DOMAINS,
  deriveStatus,
  isVendorDomain,
  slugForOffer,
  ulid,
  utcIsoDate,
  type Candidate,
  type Offer,
} from '@cert-tracker/core';
import { pageLines } from '@cert-tracker/sources';

import { readBaseEnv } from '../lib/env.ts';
import { isAdapterError } from '../lib/errors.ts';
import { createHttpClient, type HttpClient } from '../lib/http.ts';
import { createBudgetGuard, type BudgetGuard } from '../lib/llm/budget.ts';
import { createLlmClient, type ExtractInput, type LlmClient } from '../lib/llm/client.ts';
import { readLlmConfig } from '../lib/llm/config.ts';
import type { Extraction } from '../lib/llm/schemas.ts';
import { VerifyMessageSchema, type VerifyMessage } from '../lib/messages.ts';
import { politeHttp } from '../lib/polite.ts';
import { promoteCandidate } from '../lib/promote.ts';
import {
  candidatePutItem,
  createDocClient,
  deferSignal,
  listOffers,
  newEvent,
  offerPutItem,
  putCandidateIfAbsent,
  setSignalState,
  writeChange,
  writeEventOnly,
  type DocClient,
} from '../lib/repo/index.ts';
import { count, flushMetrics, logger, tracer } from '../lib/telemetry.ts';
import { emitBudgetExceeded } from './triage.ts';

const PAGE_TEXT_MAX = 12_000;
const LINKED_PAGES_MAX = 2;
const RATIONALE_MAX = 500;

export type VerifyOutcome =
  | 'deferred'
  | 'unreachable'
  | 'not-offer'
  | 'parse-failed'
  | 'invalid'
  | 'candidate'
  | 'auto-accepted'
  | 'duplicate';

export interface VerifyDeps {
  doc: DocClient;
  table: string;
  http: HttpClient;
  llm: LlmClient;
  budget: BudgetGuard;
  model: string;
  now: () => Date;
}

function registrable(hostname: string): string {
  return hostname.toLowerCase().split('.').slice(-2).join('.');
}

// links on the signal page that could be the vendor's own offer page: same site first, then
// any host in the vendor domain map
export function candidateLinks(html: string, pageUrl: string): string[] {
  const base = new URL(pageUrl);
  const own = registrable(base.hostname);
  const vendorHosts = new Set(Object.values(VENDOR_DOMAINS).flat());
  const seen = new Set<string>();
  const same: string[] = [];
  const vendor: string[] = [];
  for (const match of html.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)) {
    let url: URL;
    try {
      url = new URL(match[1] ?? '', base);
    } catch {
      continue;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;
    url.hash = '';
    const key = url.toString();
    if (key === base.toString() || seen.has(key)) continue;
    if (/\.(png|jpe?g|gif|svg|css|js|pdf|zip)(\?|$)/i.test(url.pathname)) continue;
    if (/\/(share|login|signin|cart|search)\b/i.test(url.pathname)) continue;
    seen.add(key);
    const host = registrable(url.hostname);
    if (host === own) same.push(key);
    else if (vendorHosts.has(host)) vendor.push(key);
  }
  return [...same, ...vendor].slice(0, LINKED_PAGES_MAX);
}

async function fetchPageText(
  deps: VerifyDeps,
  url: string,
): Promise<{ text: string; html: string } | null> {
  try {
    const response = await deps.http.get(url, { maxBytes: 1_000_000 });
    if (response.status >= 400) return null;
    return { text: pageLines(response.text).join('\n'), html: response.text };
  } catch (error) {
    if (isAdapterError(error)) return null;
    throw error;
  }
}

async function gatherText(deps: VerifyDeps, url: string): Promise<string | null> {
  const primary = await fetchPageText(deps, url);
  if (primary === null) return null;
  const parts = [`[${url}]\n${primary.text}`];
  for (const link of candidateLinks(primary.html, url)) {
    const page = await fetchPageText(deps, link);
    if (page !== null && page.text !== '') parts.push(`[${link}]\n${page.text}`);
  }
  const joined = parts.join('\n\n');
  return joined.length > PAGE_TEXT_MAX ? joined.slice(0, PAGE_TEXT_MAX) : joined;
}

function needsSearch(extraction: Extraction): boolean {
  return (
    (extraction.windowStart === null && extraction.windowEnd === null) ||
    extraction.eligibility.length === 0
  );
}

function toCandidate(
  extraction: Extraction,
  message: VerifyMessage,
  provenance: { promptVersion: string; model: string },
  now: Date,
): Candidate | null {
  const today = utcIsoDate(now);
  const parsed = CandidateSchema.safeParse({
    candidateId: ulid(now.getTime()),
    name: extraction.name,
    vendor: extraction.vendor,
    category: extraction.category,
    // the model may repeat itself; the lists are sets
    tracks: [...new Set(extraction.tracks)],
    technologies: [...new Set(extraction.technologies)],
    certifications: extraction.certifications,
    examCode: extraction.examCode,
    whatIsFree: extraction.whatIsFree,
    cost: extraction.cost,
    credentialWeight: extraction.credentialWeight,
    eligibility: extraction.eligibility,
    regions: extraction.regions,
    windowStart: extraction.windowStart,
    windowEnd: extraction.windowEnd,
    status: deriveStatus(
      {
        status: 'active',
        windowStart: extraction.windowStart,
        windowEnd: extraction.windowEnd,
        recurring: extraction.recurring,
      },
      today,
    ),
    recurring: extraction.recurring,
    requirements: extraction.requirements,
    url: extraction.url,
    sourceUrl: extraction.sourceUrl,
    lastVerified: today,
    verificationNote: `extracted from ${extraction.sourceUrl}`,
    notes: extraction.notes,
    stage: 'verified',
    confidence: extraction.confidence,
    matchesExistingId: extraction.matchesExistingId,
    signalIds: [message.signalId],
    promptVersion: provenance.promptVersion,
    model: provenance.model,
    llmRationale: extraction.rationale.slice(0, RATIONALE_MAX),
    createdAt: now.toISOString(),
  });
  if (!parsed.success) {
    logger.warn('extraction does not make a valid candidate', {
      signalId: message.signalId,
      issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
    return null;
  }
  return parsed.data;
}

// the one path from candidate to offer without a person: high confidence, the vendor's own
// page, not an update, and a slug nobody has. It still lands as unverified.
export function autoAcceptable(candidate: Candidate, existing: readonly Offer[]): boolean {
  if (candidate.confidence !== 'high' || candidate.matchesExistingId !== null) return false;
  if (!isVendorDomain(candidate.vendor, candidate.sourceUrl)) return false;
  const slug = slugForOffer(candidate.vendor, candidate.name, candidate.windowEnd);
  return !existing.some((offer) => offer.id === slug);
}

export function offerFromCandidate(
  candidate: Candidate,
  existing: readonly Offer[],
  signalUrl: string,
  now: Date,
): Offer {
  return promoteCandidate(
    candidate,
    existing,
    {
      status: 'unverified',
      verificationNote: `auto-accepted from ${signalUrl}; not yet checked by a person`,
    },
    now,
  );
}

export async function runVerify(deps: VerifyDeps, message: VerifyMessage): Promise<VerifyOutcome> {
  const decision = await deps.budget.check(deps.now());
  if (!decision.allowed) {
    await deferSignal(deps.doc, deps.table, message, 'verify', deps.now());
    await emitBudgetExceeded(deps, decision);
    count('LlmBudgetSkipped', 1);
    return 'deferred';
  }

  const pageText = await gatherText(deps, message.url);
  if (pageText === null || pageText.trim() === '') {
    logger.warn('signal page unreachable', { signalId: message.signalId, url: message.url });
    await setSignalState(
      deps.doc,
      deps.table,
      message.sourceId,
      message.fingerprint,
      'verify-failed',
    );
    return 'unreachable';
  }

  const existing = await listOffers(deps.doc, deps.table);
  const input: ExtractInput = {
    signal: { url: message.url, title: message.title },
    pageText,
    offers: existing.map((o) => ({
      id: o.id,
      name: o.name,
      vendor: o.vendor,
      windowEnd: o.windowEnd,
    })),
  };

  let call = await deps.llm.extract(deps.model, input);
  await deps.budget.record(deps.now(), call.model, call.usage);
  if (call.result?.isOffer === true && needsSearch(call.result)) {
    // the page didn't say when or for whom; one bounded search, then extract again with the notes
    const search = await deps.llm.search(deps.model, input);
    await deps.budget.record(deps.now(), search.model, search.usage);
    if (search.result !== '') {
      const second = await deps.llm.extract(deps.model, { ...input, searchNotes: search.result });
      await deps.budget.record(deps.now(), second.model, second.usage);
      if (second.result?.isOffer === true) call = second;
    }
  }

  if (call.result === null) {
    logger.warn('extraction failed to parse', {
      signalId: message.signalId,
      raw: call.rawText.slice(0, 2000),
    });
    await setSignalState(
      deps.doc,
      deps.table,
      message.sourceId,
      message.fingerprint,
      'verify-failed',
    );
    return 'parse-failed';
  }
  if (!call.result.isOffer) {
    await setSignalState(deps.doc, deps.table, message.sourceId, message.fingerprint, 'verified');
    return 'not-offer';
  }

  const candidate = toCandidate(call.result, message, call, deps.now());
  if (candidate === null) {
    await setSignalState(
      deps.doc,
      deps.table,
      message.sourceId,
      message.fingerprint,
      'verify-failed',
    );
    return 'invalid';
  }

  let outcome: VerifyOutcome;
  if (autoAcceptable(candidate, existing)) {
    const now = deps.now();
    const offer = offerFromCandidate(candidate, existing, message.url, now);
    const approved: Candidate = {
      ...candidate,
      stage: 'approved',
      decidedAt: now.toISOString(),
      decidedBy: 'auto',
    };
    const result = await writeChange(deps.doc, deps.table, {
      event: newEvent(
        {
          type: 'offer.discovered',
          audience: 'public',
          offerId: offer.id,
          candidateId: candidate.candidateId,
          idempotencyKey: `offer#${offer.id}#discovered`,
          payload: {
            name: offer.name,
            vendor: offer.vendor,
            status: 'unverified',
            unverified: true,
          },
        },
        now,
      ),
      writes: [offerPutItem(deps.table, offer), candidatePutItem(deps.table, approved)],
      now,
    });
    if (result === 'applied') {
      count('OffersDiscovered', 1);
      outcome = 'auto-accepted';
    } else {
      outcome = 'duplicate';
    }
  } else {
    await putCandidateIfAbsent(deps.doc, deps.table, candidate);
    await writeEventOnly(
      deps.doc,
      deps.table,
      newEvent(
        {
          type: 'candidate.needs_review',
          audience: 'admin',
          candidateId: candidate.candidateId,
          idempotencyKey: `candidate#${candidate.candidateId}`,
          payload: {
            name: candidate.name,
            vendor: candidate.vendor,
            confidence: candidate.confidence,
            matchesExistingId: candidate.matchesExistingId,
          },
        },
        deps.now(),
      ),
    );
    outcome = 'candidate';
  }

  await setSignalState(deps.doc, deps.table, message.sourceId, message.fingerprint, 'verified');
  logger.info('signal verified', {
    signalId: message.signalId,
    outcome,
    candidateId: candidate.candidateId,
  });
  return outcome;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

let cached: Omit<VerifyDeps, 'now'> | undefined;

async function dependencies(): Promise<Omit<VerifyDeps, 'now'>> {
  if (cached !== undefined) return cached;
  const env = readBaseEnv();
  const config = await readLlmConfig(env.ssmPrefix);
  const doc = tracer.captureAWSv3Client(createDocClient());
  cached = {
    doc,
    table: env.tableName,
    http: politeHttp(
      createHttpClient({
        userAgent: process.env.USER_AGENT ?? 'cert-tracker',
        timeoutMs: 15_000,
        retry: { attempts: 2 },
      }),
      sleep,
    ),
    llm: createLlmClient(config.apiKey),
    budget: createBudgetGuard({
      doc,
      table: env.tableName,
      dailyCapUsd: config.dailyCapUsd,
      pricing: config.pricing,
    }),
    model: config.verifyModel,
  };
  return cached;
}

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const failures: { itemIdentifier: string }[] = [];
  try {
    const deps = { ...(await dependencies()), now: () => new Date() };
    for (const record of event.Records) {
      let message: VerifyMessage;
      try {
        message = VerifyMessageSchema.parse(JSON.parse(record.body));
      } catch (error) {
        logger.error('dropping unreadable verify message', { messageId: record.messageId, error });
        continue;
      }
      try {
        const outcome = await runVerify(deps, message);
        logger.info('verify finished', { signalId: message.signalId, outcome });
      } catch (error) {
        logger.error('verify failed', { signalId: message.signalId, error });
        failures.push({ itemIdentifier: record.messageId });
      }
    }
    return { batchItemFailures: failures };
  } finally {
    flushMetrics();
  }
}
