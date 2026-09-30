import type { Signal, Source } from '@cert-tracker/core';
import { SignalSchema, ulid, utcIsoDate } from '@cert-tracker/core';
import { signalFingerprint } from '@cert-tracker/core/dedupe';
import { adapterFor, clip, passesPrefilter, type AdapterContext } from '@cert-tracker/sources';

import { readBaseEnv } from '../lib/env.ts';
import { AdapterError, isAdapterError } from '../lib/errors.ts';
import { createHttpClient, type HttpClient } from '../lib/http.ts';
import type { TriageMessage, VerifyMessage } from '../lib/messages.ts';
import { politeHttp } from '../lib/polite.ts';
import {
  UNHEALTHY_AFTER_FAILURES,
  acquireLock,
  createDocClient,
  listDeferredSignals,
  listSources,
  newEvent,
  putSignalIfAbsent,
  putSource,
  releaseLock,
  requeueSignal,
  seenFingerprints,
  setSystemMeta,
  writeEventOnly,
  type DocClient,
} from '../lib/repo/index.ts';
import { readParameter } from '../lib/secrets.ts';
import { createQueueSender, type QueueSender } from '../lib/sqs.ts';
import { count, flushMetrics, logger, tracer } from '../lib/telemetry.ts';

export const LOCK_NAME = 'poll';
export const LEASE_SECONDS = 300;
const CHUNK_SIZE = 4;
const SOURCE_TIMEOUT_MS = 15_000;
// keeps an hourly source from being skipped by an hourly schedule that drifts a few seconds
const DUE_SLACK_MS = 5 * 60_000;
const DISABLE_AFTER_FAILURES = 10;
const ERROR_MAX = 500;

export interface PollDeps {
  doc: DocClient;
  table: string;
  http: HttpClient;
  queue: QueueSender;
  triageQueueUrl: string;
  verifyQueueUrl: string;
  now: () => Date;
  githubToken?: string;
}

export interface PollSummary {
  ran: boolean;
  requeued: number;
  due: number;
  polled: number;
  failed: number;
  newSignals: number;
  unhealthy: number;
}

interface SourceOutcome {
  source: Source;
  signals: Signal[];
  state: Partial<Source['state']>;
}

export function isDue(source: Source, now: Date): boolean {
  const { state } = source;
  if (state.cooldownUntil !== undefined && Date.parse(state.cooldownUntil) > now.getTime()) {
    return false;
  }
  if (state.lastPolledAt === undefined) return true;
  const next = Date.parse(state.lastPolledAt) + source.pollIntervalMinutes * 60_000 - DUE_SLACK_MS;
  return next <= now.getTime();
}

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new AdapterError('poll', 'timeout', `${what} took longer than ${String(ms)}ms`, {
          retryable: false,
        }),
      );
    }, ms);
    promise.then(resolve, reject).finally(() => {
      clearTimeout(timer);
    });
  });
}

export function toTriageMessage(signal: Signal): TriageMessage {
  return {
    signalId: signal.signalId,
    sourceId: signal.sourceId,
    fingerprint: signal.fingerprint,
    seenAt: signal.seenAt,
    url: signal.url,
    title: signal.title,
    excerpt: signal.excerpt,
  };
}

async function pollSource(
  source: Source,
  context: AdapterContext,
  deps: PollDeps,
): Promise<SourceOutcome> {
  const adapter = adapterFor(source.kind);
  if (adapter === null) return { source, signals: [], state: {} };
  const { items, state } = await adapter.fetch(source, context);
  const now = context.now;

  // the prefilter is where most LLM cost is avoided; it runs on the source's materialised lists
  const kept = items.filter((item) =>
    passesPrefilter(
      `${item.title}\n${item.excerpt}`,
      source.keywordsInclude,
      source.keywordsExclude,
    ),
  );
  const byFingerprint = new Map<string, (typeof kept)[number]>();
  for (const item of kept) {
    const fingerprint = signalFingerprint(item.url, item.title);
    if (!byFingerprint.has(fingerprint)) byFingerprint.set(fingerprint, item);
  }
  const seen = await seenFingerprints(deps.doc, deps.table, source.sourceId, [
    ...byFingerprint.keys(),
  ]);

  const signals: Signal[] = [];
  for (const [fingerprint, item] of byFingerprint) {
    if (seen.has(fingerprint)) continue;
    const parsed = SignalSchema.safeParse({
      signalId: ulid(now.getTime()),
      sourceId: source.sourceId,
      fingerprint,
      url: item.url,
      title: clip(item.title, 500),
      excerpt: clip(item.excerpt),
      publishedAt: item.publishedAt,
      seenAt: now.toISOString(),
      state: 'queued',
    });
    if (!parsed.success) {
      logger.warn('dropping malformed signal item', { sourceId: source.sourceId, url: item.url });
      continue;
    }
    if ((await putSignalIfAbsent(deps.doc, deps.table, parsed.data, now)) === 'created') {
      signals.push(parsed.data);
    }
  }
  return { source, signals, state };
}

async function requeueDeferred(deps: PollDeps, now: Date): Promise<number> {
  const today = utcIsoDate(now);
  let requeued = 0;
  for (const signal of await listDeferredSignals(deps.doc, deps.table)) {
    if (signal.deferredAt === undefined || utcIsoDate(new Date(signal.deferredAt)) >= today)
      continue;
    await requeueSignal(deps.doc, deps.table, signal);
    const message = toTriageMessage(signal);
    const toVerify = signal.deferredStage === 'verify';
    const { excerpt, ...verifyMessage } = message;
    const body: TriageMessage | VerifyMessage = toVerify
      ? verifyMessage
      : { ...verifyMessage, excerpt };
    await deps.queue.send(toVerify ? deps.verifyQueueUrl : deps.triageQueueUrl, [
      { id: signal.signalId, body: JSON.stringify(body) },
    ]);
    requeued += 1;
  }
  return requeued;
}

function failureState(source: Source, error: unknown, now: Date): Source['state'] {
  const message = error instanceof Error ? error.message : String(error);
  const failures = source.state.consecutiveFailures + 1;
  const cooldown =
    isAdapterError(error) && error.kind === 'rate-limited' && error.retryAfterMs !== undefined
      ? { cooldownUntil: new Date(now.getTime() + error.retryAfterMs).toISOString() }
      : {};
  return {
    ...source.state,
    ...cooldown,
    consecutiveFailures: failures,
    lastError: clip(message, ERROR_MAX),
    lastPolledAt: now.toISOString(),
  };
}

export async function runPoll(deps: PollDeps): Promise<PollSummary> {
  const summary: PollSummary = {
    ran: false,
    requeued: 0,
    due: 0,
    polled: 0,
    failed: 0,
    newSignals: 0,
    unhealthy: 0,
  };
  const lease = await acquireLock(deps.doc, deps.table, LOCK_NAME, LEASE_SECONDS, deps.now());
  if (lease === null) return summary;

  try {
    summary.ran = true;
    summary.requeued = await requeueDeferred(deps, deps.now());

    const sources = (await listSources(deps.doc, deps.table)).filter((s) => s.enabled);
    const due = sources.filter((s) => isDue(s, deps.now()));
    summary.due = due.length;
    const context: AdapterContext = {
      http: deps.http,
      now: deps.now(),
      ...(deps.githubToken === undefined ? {} : { githubToken: deps.githubToken }),
    };

    for (let i = 0; i < due.length; i += CHUNK_SIZE) {
      const chunk = due.slice(i, i + CHUNK_SIZE);
      const results = await Promise.allSettled(
        chunk.map((source) =>
          withTimeout(
            pollSource(source, { ...context, now: deps.now() }, deps),
            SOURCE_TIMEOUT_MS,
            source.sourceId,
          ),
        ),
      );
      for (const [index, result] of results.entries()) {
        const source = chunk[index];
        if (source === undefined) continue;
        const now = deps.now();
        if (result.status === 'fulfilled') {
          const { signals, state } = result.value;
          if (signals.length > 0) {
            await deps.queue.send(
              deps.triageQueueUrl,
              signals.map((s) => ({ id: s.signalId, body: JSON.stringify(toTriageMessage(s)) })),
            );
          }
          summary.polled += 1;
          summary.newSignals += signals.length;
          await putSource(deps.doc, deps.table, {
            ...source,
            state: {
              ...source.state,
              ...state,
              consecutiveFailures: 0,
              lastError: undefined,
              cooldownUntil: undefined,
              lastPolledAt: now.toISOString(),
              lastSuccessAt: now.toISOString(),
            },
          });
          logger.info('source polled', { sourceId: source.sourceId, newSignals: signals.length });
          continue;
        }

        summary.failed += 1;
        const state = failureState(source, result.reason, now);
        const enabled = state.consecutiveFailures < DISABLE_AFTER_FAILURES;
        logger.warn('source failed', {
          sourceId: source.sourceId,
          failures: state.consecutiveFailures,
          error: state.lastError,
          disabled: !enabled,
        });
        if (state.consecutiveFailures === UNHEALTHY_AFTER_FAILURES) {
          await writeEventOnly(
            deps.doc,
            deps.table,
            newEvent(
              {
                type: 'source.unhealthy',
                audience: 'admin',
                idempotencyKey: `source#${source.sourceId}#unhealthy#${source.state.lastSuccessAt ?? 'never'}`,
                payload: { sourceId: source.sourceId, error: state.lastError },
              },
              now,
            ),
          );
        }
        await putSource(deps.doc, deps.table, { ...source, enabled, state });
      }
    }

    const after = (await listSources(deps.doc, deps.table)).filter((s) => s.enabled);
    summary.unhealthy = after.filter(
      (s) => s.state.consecutiveFailures >= UNHEALTHY_AFTER_FAILURES,
    ).length;
    count('SignalsNew', summary.newSignals);
    count('SourcesUnhealthy', summary.unhealthy);
    await setSystemMeta(deps.doc, deps.table, { lastPollAt: deps.now().toISOString() });
    return summary;
  } finally {
    await releaseLock(deps.doc, deps.table, lease);
  }
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

let cached: Omit<PollDeps, 'now'> | undefined;

async function dependencies(): Promise<Omit<PollDeps, 'now'>> {
  if (cached !== undefined) return cached;
  const env = readBaseEnv();
  const triageQueueUrl = process.env.TRIAGE_QUEUE_URL;
  const verifyQueueUrl = process.env.VERIFY_QUEUE_URL;
  if (triageQueueUrl === undefined || verifyQueueUrl === undefined) {
    throw new Error('TRIAGE_QUEUE_URL and VERIFY_QUEUE_URL are required');
  }
  // the token is optional: without it GitHub allows 60 requests an hour, which is enough for
  // two sources but not for a busy day
  const githubToken = await readParameter(`${env.ssmPrefix}/github/token`).catch(() => undefined);
  const http = createHttpClient({
    userAgent: process.env.USER_AGENT ?? 'cert-tracker',
    timeoutMs: 12_000,
    retry: { attempts: 2 },
  });
  cached = {
    doc: tracer.captureAWSv3Client(createDocClient()),
    table: env.tableName,
    http: politeHttp(http, sleep),
    queue: createQueueSender(),
    triageQueueUrl,
    verifyQueueUrl,
    ...(githubToken === undefined ? {} : { githubToken }),
  };
  return cached;
}

export async function handler(): Promise<PollSummary> {
  try {
    const summary = await runPoll({ ...(await dependencies()), now: () => new Date() });
    logger.info('poll finished', { ...summary });
    return summary;
  } catch (error) {
    logger.error('poll failed', { error });
    throw error;
  } finally {
    flushMetrics();
  }
}
