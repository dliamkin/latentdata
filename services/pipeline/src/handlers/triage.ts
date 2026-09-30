import type { SQSBatchResponse, SQSEvent } from 'aws-lambda';

import { readBaseEnv } from '../lib/env.ts';
import { isAdapterError } from '../lib/errors.ts';
import { createBudgetGuard, type BudgetGuard } from '../lib/llm/budget.ts';
import { createLlmClient, type LlmClient } from '../lib/llm/client.ts';
import { readLlmConfig } from '../lib/llm/config.ts';
import type { TriageInput } from '../lib/llm/schemas.ts';
import { TriageMessageSchema, type TriageMessage, type VerifyMessage } from '../lib/messages.ts';
import {
  createDocClient,
  deferSignal,
  newEvent,
  setSignalState,
  setSignalTriage,
  writeEventOnly,
  type DocClient,
} from '../lib/repo/index.ts';
import { createQueueSender, type QueueSender } from '../lib/sqs.ts';
import { count, flushMetrics, logger, tracer } from '../lib/telemetry.ts';

// below this the model wasn't sure enough to spend the expensive verification on
export const VERIFY_THRESHOLD = 0.6;

export interface TriageDeps {
  doc: DocClient;
  table: string;
  llm: LlmClient;
  budget: BudgetGuard;
  queue: QueueSender;
  verifyQueueUrl: string;
  model: string;
  now: () => Date;
}

export interface QueueRecord {
  messageId: string;
  body: string;
}

export interface TriageSummary {
  received: number;
  deferred: number;
  relevant: number;
  failed: number;
  batchItemFailures: { itemIdentifier: string }[];
}

function parseRecords(records: readonly QueueRecord[]): { id: string; message: TriageMessage }[] {
  const parsed: { id: string; message: TriageMessage }[] = [];
  for (const record of records) {
    try {
      parsed.push({
        id: record.messageId,
        message: TriageMessageSchema.parse(JSON.parse(record.body)),
      });
    } catch (error) {
      // a message that can never parse would loop through the queue forever; drop it, loudly
      logger.error('dropping unreadable triage message', { messageId: record.messageId, error });
    }
  }
  return parsed;
}

export async function emitBudgetExceeded(
  deps: Pick<TriageDeps, 'doc' | 'table' | 'now'>,
  decision: { date: string; spentMicroUsd: number; capMicroUsd: number },
): Promise<void> {
  await writeEventOnly(
    deps.doc,
    deps.table,
    newEvent(
      {
        type: 'budget.exceeded',
        audience: 'admin',
        idempotencyKey: `budget#${decision.date}`,
        payload: {
          date: decision.date,
          spentUsd: decision.spentMicroUsd / 1_000_000,
          capUsd: decision.capMicroUsd / 1_000_000,
        },
      },
      deps.now(),
    ),
  );
}

export async function runTriage(
  deps: TriageDeps,
  records: readonly QueueRecord[],
): Promise<TriageSummary> {
  const summary: TriageSummary = {
    received: records.length,
    deferred: 0,
    relevant: 0,
    failed: 0,
    batchItemFailures: [],
  };
  const entries = parseRecords(records);
  if (entries.length === 0) return summary;

  const decision = await deps.budget.check(deps.now());
  if (!decision.allowed) {
    // parked in the table, not left on the queue: the next poll re-queues them after midnight
    for (const { message } of entries) {
      await deferSignal(deps.doc, deps.table, message, 'triage', deps.now());
    }
    await emitBudgetExceeded(deps, decision);
    count('LlmBudgetSkipped', entries.length);
    summary.deferred = entries.length;
    return summary;
  }

  const items: TriageInput[] = entries.map(({ message }) => ({
    signalId: message.signalId,
    title: message.title,
    url: message.url,
    excerpt: message.excerpt,
  }));

  let call;
  try {
    call = await deps.llm.triage(deps.model, items);
  } catch (error) {
    if (isAdapterError(error) && !error.retryable) {
      // the answer came back but was unusable; a retry would send the same items again
      logger.warn('triage answer unusable; marking signals verify-failed', {
        error: error.message,
      });
      for (const { message } of entries) {
        await setSignalState(
          deps.doc,
          deps.table,
          message.sourceId,
          message.fingerprint,
          'verify-failed',
        );
      }
      summary.failed = entries.length;
      return summary;
    }
    throw error;
  }
  await deps.budget.record(deps.now(), call.model, call.usage);

  const verdicts = new Map(call.result.map((verdict) => [verdict.signalId, verdict]));
  const toVerify: { id: string; body: string }[] = [];
  for (const { id, message } of entries) {
    const verdict = verdicts.get(message.signalId);
    const relevant = verdict?.relevant ?? false;
    const confidence = Math.min(1, Math.max(0, verdict?.confidence ?? 0));
    try {
      await setSignalTriage(deps.doc, deps.table, message.sourceId, message.fingerprint, {
        verdict: relevant ? 'relevant' : 'irrelevant',
        confidence,
        reason: (verdict?.reason ?? 'no verdict returned').slice(0, 500),
        promptVersion: call.promptVersion,
        model: call.model,
      });
    } catch (error) {
      logger.error('could not store triage verdict', { signalId: message.signalId, error });
      summary.batchItemFailures.push({ itemIdentifier: id });
      continue;
    }
    if (relevant && confidence >= VERIFY_THRESHOLD) {
      const body: VerifyMessage = {
        signalId: message.signalId,
        sourceId: message.sourceId,
        fingerprint: message.fingerprint,
        seenAt: message.seenAt,
        url: message.url,
        title: message.title,
      };
      toVerify.push({ id: message.signalId, body: JSON.stringify(body) });
    }
  }
  if (toVerify.length > 0) await deps.queue.send(deps.verifyQueueUrl, toVerify);
  summary.relevant = toVerify.length;
  count('TriageRelevant', toVerify.length);
  logger.info('triage batch done', {
    received: entries.length,
    relevant: toVerify.length,
    inputTokens: call.usage.inputTokens,
    outputTokens: call.usage.outputTokens,
    cacheReadTokens: call.usage.cacheReadTokens,
  });
  return summary;
}

let cached: Omit<TriageDeps, 'now'> | undefined;

async function dependencies(): Promise<Omit<TriageDeps, 'now'>> {
  if (cached !== undefined) return cached;
  const env = readBaseEnv();
  const verifyQueueUrl = process.env.VERIFY_QUEUE_URL;
  if (verifyQueueUrl === undefined) throw new Error('VERIFY_QUEUE_URL is required');
  const config = await readLlmConfig(env.ssmPrefix);
  const doc = tracer.captureAWSv3Client(createDocClient());
  cached = {
    doc,
    table: env.tableName,
    llm: createLlmClient(config.apiKey),
    budget: createBudgetGuard({
      doc,
      table: env.tableName,
      dailyCapUsd: config.dailyCapUsd,
      pricing: config.pricing,
    }),
    queue: createQueueSender(),
    verifyQueueUrl,
    model: config.triageModel,
  };
  return cached;
}

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  try {
    const summary = await runTriage(
      { ...(await dependencies()), now: () => new Date() },
      event.Records.map((r) => ({ messageId: r.messageId, body: r.body })),
    );
    logger.info('triage finished', {
      ...summary,
      batchItemFailures: summary.batchItemFailures.length,
    });
    return { batchItemFailures: summary.batchItemFailures };
  } catch (error) {
    logger.error('triage failed', { error });
    throw error;
  } finally {
    flushMetrics();
  }
}
