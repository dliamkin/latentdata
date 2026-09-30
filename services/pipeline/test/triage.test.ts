import { TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { beforeEach, describe, expect, it } from 'vitest';

import { VERIFY_THRESHOLD, runTriage, type TriageDeps } from '../src/handlers/triage.ts';
import { AdapterError } from '../src/lib/errors.ts';
import { fakeBudget, fakeLlm, fakeQueue } from './fakes.ts';
import { TABLE, docMock } from './helpers.ts';

const NOW = new Date('2026-09-30T08:00:00.000Z');
const { doc, mock } = docMock();
const VERIFY = 'https://sqs/verify';

function record(n: number, overrides: Record<string, unknown> = {}) {
  return {
    messageId: `m${String(n)}`,
    body: JSON.stringify({
      signalId: `01ARZ3NDEKTSV4RRFFQ69G5FA${String(n)}`,
      sourceId: 'rss-vendor-blog',
      fingerprint: String(n).padEnd(64, '0'),
      seenAt: NOW.toISOString(),
      url: `https://vendor.example/post-${String(n)}`,
      title: `Post ${String(n)}`,
      excerpt: 'Free exam voucher for everyone',
      ...overrides,
    }),
  };
}

function deps(
  overrides: Partial<Omit<TriageDeps, 'queue'>> = {},
): TriageDeps & { queue: ReturnType<typeof fakeQueue> } {
  const queue = fakeQueue();
  return {
    doc,
    table: TABLE,
    llm: fakeLlm(),
    budget: fakeBudget(),
    queue,
    verifyQueueUrl: VERIFY,
    model: 'claude-haiku-4-5',
    now: () => NOW,
    ...overrides,
  };
}

const updates = () => mock.commandCalls(UpdateCommand).map((c) => c.args[0].input);

beforeEach(() => {
  mock.reset();
  mock.on(UpdateCommand).resolves({});
  mock.on(TransactWriteCommand).resolves({});
});

describe('runTriage', () => {
  it('stores every verdict and forwards only confident relevant ones', async () => {
    const llm = fakeLlm({
      verdicts: [
        {
          signalId: '01ARZ3NDEKTSV4RRFFQ69G5FA1',
          relevant: true,
          confidence: 0.95,
          reason: 'voucher offer',
        },
        {
          signalId: '01ARZ3NDEKTSV4RRFFQ69G5FA2',
          relevant: true,
          confidence: VERIFY_THRESHOLD - 0.01,
          reason: 'maybe',
        },
        {
          signalId: '01ARZ3NDEKTSV4RRFFQ69G5FA3',
          relevant: false,
          confidence: 0.1,
          reason: 'exam dumps',
        },
      ],
    });
    const d = deps({ llm });
    const summary = await runTriage(d, [record(1), record(2), record(3), record(4)]);
    expect(summary).toMatchObject({
      received: 4,
      relevant: 1,
      deferred: 0,
      failed: 0,
      batchItemFailures: [],
    });

    const stored = updates().filter((u) => u.UpdateExpression?.includes('triage = :triage'));
    expect(stored).toHaveLength(4);
    expect(stored[0]?.ExpressionAttributeValues?.[':triage']).toMatchObject({
      verdict: 'relevant',
      confidence: 0.95,
      promptVersion: '1',
      model: 'claude-haiku-4-5',
    });
    // a signal the model forgot to answer is stored as irrelevant, not lost
    expect(stored[3]?.ExpressionAttributeValues?.[':triage']).toMatchObject({
      verdict: 'irrelevant',
      confidence: 0,
    });

    expect(d.queue.sent).toHaveLength(1);
    expect(d.queue.sent[0]?.bodies).toEqual([
      expect.objectContaining({
        signalId: '01ARZ3NDEKTSV4RRFFQ69G5FA1',
        url: 'https://vendor.example/post-1',
      }),
    ]);
    expect(d.queue.sent[0]?.bodies[0]).not.toHaveProperty('excerpt');
    expect((d.budget as ReturnType<typeof fakeBudget>).recorded).toEqual(['claude-haiku-4-5']);
  });

  it('parks the batch and records the day once the budget is spent', async () => {
    const d = deps({ budget: fakeBudget(false) });
    const summary = await runTriage(d, [record(1), record(2)]);
    expect(summary).toMatchObject({ deferred: 2, relevant: 0 });
    const deferrals = updates().filter(
      (u) => u.ExpressionAttributeValues?.[':state'] === 'deferred',
    );
    expect(deferrals).toHaveLength(2);
    expect(deferrals[0]?.ExpressionAttributeValues).toMatchObject({
      ':stage': 'triage',
      ':gsi1pk': 'SIGSTATE#deferred',
    });
    const event =
      mock.commandCalls(TransactWriteCommand)[0]?.args[0].input.TransactItems?.[1]?.Put?.Item;
    expect(event).toMatchObject({ type: 'budget.exceeded', idempotencyKey: 'budget#2026-09-30' });
    expect(d.llm.triage).not.toHaveBeenCalled();
  });

  it('marks signals verify-failed when the answer is unusable, and does not retry', async () => {
    const llm = fakeLlm();
    llm.triage.mockRejectedValueOnce(
      new AdapterError('anthropic', 'invalid-response', 'unusable', { retryable: false }),
    );
    const summary = await runTriage(deps({ llm }), [record(1)]);
    expect(summary).toMatchObject({ failed: 1, batchItemFailures: [] });
    expect(updates()[0]?.ExpressionAttributeValues).toEqual({ ':state': 'verify-failed' });
  });

  it('lets a transport failure bubble so the queue retries the batch', async () => {
    const llm = fakeLlm();
    llm.triage.mockRejectedValueOnce(
      new AdapterError('anthropic', 'timeout', 'slow', { retryable: true }),
    );
    await expect(runTriage(deps({ llm }), [record(1)])).rejects.toThrow('slow');
  });

  it('drops a message it can never parse and answers the rest', async () => {
    const llm = fakeLlm({ verdicts: [] });
    const summary = await runTriage(deps({ llm }), [
      { messageId: 'bad', body: '{not json' },
      record(1),
    ]);
    expect(summary).toMatchObject({ received: 2, batchItemFailures: [] });
    expect(llm.triage).toHaveBeenCalledWith('claude-haiku-4-5', [
      expect.objectContaining({ title: 'Post 1' }),
    ]);
  });
});
