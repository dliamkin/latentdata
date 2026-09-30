import { readFileSync } from 'node:fs';

import {
  BatchGetCommand,
  DeleteCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Source } from '@cert-tracker/core';

import { isDue, runPoll, type PollDeps } from '../src/handlers/poll.ts';
import { AdapterError } from '../src/lib/errors.ts';
import { signalToItem, sourceToItem } from '../src/lib/repo/index.ts';
import { fakeHttp, fakeQueue, response } from './fakes.ts';
import { TABLE, awsError, docMock, source } from './helpers.ts';

const NOW = new Date('2026-09-30T07:07:00.000Z');
const FEED = readFileSync(
  new URL('../../../fixtures/sources/rss-aws-training-blog/response.xml', import.meta.url),
  'utf8',
);
const { doc, mock } = docMock();

const TRIAGE = 'https://sqs/triage';
const VERIFY = 'https://sqs/verify';

function arrange(
  sources: Source[],
  deferred: Record<string, unknown>[] = [],
  seen: string[] = [],
): void {
  mock.on(PutCommand).resolves({});
  mock.on(DeleteCommand).resolves({});
  mock.on(UpdateCommand).resolves({});
  mock.on(TransactWriteCommand).resolves({});
  mock.on(BatchGetCommand).resolves({ Responses: { [TABLE]: seen.map((SK) => ({ SK })) } });
  mock
    .on(QueryCommand)
    .callsFake((input: { ExpressionAttributeValues?: Record<string, unknown> }) => {
      switch (input.ExpressionAttributeValues?.[':pk']) {
        case 'SOURCES':
          return { Items: sources.map(sourceToItem) };
        case 'SIGSTATE#deferred':
          return { Items: deferred };
        default:
          return { Items: [] };
      }
    });
}

function deps(
  http: PollDeps['http'],
  queue = fakeQueue(),
): PollDeps & { queue: ReturnType<typeof fakeQueue> } {
  return {
    doc,
    table: TABLE,
    http,
    queue,
    triageQueueUrl: TRIAGE,
    verifyQueueUrl: VERIFY,
    now: () => NOW,
  };
}

const putSources = () =>
  mock
    .commandCalls(PutCommand)
    .map((c) => c.args[0].input.Item)
    .filter((item): item is Record<string, unknown> => item?.entity === 'SOURCE');

beforeEach(() => {
  mock.reset();
});

describe('isDue', () => {
  const base = source({ pollIntervalMinutes: 60 });
  it.each([
    ['never polled', {}, true],
    ['polled 61 minutes ago', { lastPolledAt: '2026-09-30T06:06:00.000Z' }, true],
    [
      'polled 56 minutes ago (inside the slack)',
      { lastPolledAt: '2026-09-30T06:11:00.000Z' },
      true,
    ],
    ['polled 30 minutes ago', { lastPolledAt: '2026-09-30T06:37:00.000Z' }, false],
    ['cooling down', { cooldownUntil: '2026-09-30T08:00:00.000Z' }, false],
    ['cooldown over', { cooldownUntil: '2026-09-30T07:00:00.000Z' }, true],
  ])('%s', (_name, state, expected) => {
    expect(isDue({ ...base, state: { consecutiveFailures: 0, ...state } }, NOW)).toBe(expected);
  });
});

describe('runPoll', () => {
  it('stores new signals, queues them for triage and resets the failure count', async () => {
    arrange([source({ keywordsInclude: ['microcredential', 'free'] })]);
    const d = deps(
      fakeHttp({ 'https://vendor.example/feed': response(200, FEED, { etag: '"e"' }) }),
    );
    const summary = await runPoll(d);
    expect(summary).toMatchObject({ ran: true, due: 1, polled: 1, failed: 0 });
    expect(summary.newSignals).toBeGreaterThan(0);
    expect(d.queue.sent[0]?.queueUrl).toBe(TRIAGE);
    expect(d.queue.sent[0]?.bodies).toHaveLength(summary.newSignals);
    expect(d.queue.sent[0]?.bodies[0]).toMatchObject({
      sourceId: 'rss-vendor-blog',
      excerpt: expect.any(String) as unknown,
    });
    const [saved] = putSources();
    expect(saved?.state).toMatchObject({
      consecutiveFailures: 0,
      etag: '"e"',
      lastSuccessAt: NOW.toISOString(),
    });
    expect(
      mock.commandCalls(UpdateCommand).at(-1)?.args[0].input.ExpressionAttributeValues,
    ).toMatchObject({
      ':v0': NOW.toISOString(),
    });
  });

  it('never sends the LLM something the table has already seen', async () => {
    arrange([source({ keywordsInclude: ['microcredential'] })], [], []);
    const http = fakeHttp({ 'https://vendor.example/feed': response(200, FEED) });
    const first = await runPoll(deps(http));
    const fingerprints = mock
      .commandCalls(PutCommand)
      .map((c) => c.args[0].input.Item)
      .filter((i) => i?.entity === 'SIGNAL')
      .map((i) => i?.fingerprint as string);
    expect(first.newSignals).toBe(fingerprints.length);

    mock.reset();
    arrange([source({ keywordsInclude: ['microcredential'] })], [], fingerprints);
    const d = deps(http);
    const second = await runPoll(d);
    expect(second.newSignals).toBe(0);
    expect(d.queue.sent).toHaveLength(0);
  });

  it('skips sources that are not due and sources with no adapter', async () => {
    arrange([
      source({
        sourceId: 'recent',
        state: { consecutiveFailures: 0, lastPolledAt: NOW.toISOString() },
      }),
      source({ sourceId: 'api', kind: 'json-api' }),
    ]);
    const http = fakeHttp({});
    const summary = await runPoll(deps(http));
    expect(summary).toMatchObject({ due: 1, polled: 1, newSignals: 0 });
    expect(http.calls).toHaveLength(0);
  });

  it('counts a failure, flags unhealthy at three, and disables at ten', async () => {
    const failing = fakeHttp({ 'https://vendor.example/feed': response(500) });
    arrange([
      source({ state: { consecutiveFailures: 2, lastSuccessAt: '2026-09-29T00:00:00.000Z' } }),
    ]);
    expect(await runPoll(deps(failing))).toMatchObject({ failed: 1, unhealthy: 0 });
    expect(putSources()[0]?.state).toMatchObject({
      consecutiveFailures: 3,
      lastError: expect.stringMatching(/500/) as unknown,
    });
    const event =
      mock.commandCalls(TransactWriteCommand)[0]?.args[0].input.TransactItems?.[1]?.Put?.Item;
    expect(event).toMatchObject({ type: 'source.unhealthy', audience: 'admin' });

    mock.reset();
    arrange([source({ state: { consecutiveFailures: 9 } })]);
    await runPoll(deps(failing));
    expect(putSources()[0]).toMatchObject({ enabled: false, state: { consecutiveFailures: 10 } });
    expect(mock.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  it('cools a rate-limited source down until the Retry-After', async () => {
    arrange([source({})]);
    const limited = new AdapterError('http', 'rate-limited', 'slow down', {
      retryable: false,
      retryAfterMs: 3_600_000,
    });
    await runPoll(deps(fakeHttp({ 'https://vendor.example/feed': limited })));
    expect(putSources()[0]?.state).toMatchObject({
      cooldownUntil: '2026-09-30T08:07:00.000Z',
      consecutiveFailures: 1,
    });
  });

  it('re-queues signals deferred on an earlier day, to the stage they were parked at', async () => {
    const parked = (id: string, stage: 'triage' | 'verify', deferredAt: string) =>
      signalToItem(
        {
          signalId: id,
          sourceId: 'rss-vendor-blog',
          fingerprint: id.slice(-1).padStart(64, 'a'),
          url: 'https://vendor.example/post',
          title: 'Free exam voucher',
          excerpt: 'x',
          publishedAt: null,
          seenAt: '2026-09-29T10:00:00.000Z',
          state: 'deferred',
          deferredAt,
          deferredStage: stage,
        },
        NOW,
      );
    arrange(
      [],
      [
        parked('01ARZ3NDEKTSV4RRFFQ69G5FA1', 'triage', '2026-09-29T20:00:00.000Z'),
        parked('01ARZ3NDEKTSV4RRFFQ69G5FA2', 'verify', '2026-09-29T21:00:00.000Z'),
        parked('01ARZ3NDEKTSV4RRFFQ69G5FA3', 'triage', '2026-09-30T01:00:00.000Z'),
      ],
    );
    const d = deps(fakeHttp({}));
    expect((await runPoll(d)).requeued).toBe(2);
    expect(d.queue.sent.map((s) => s.queueUrl)).toEqual([TRIAGE, VERIFY]);
    expect(d.queue.sent[1]?.bodies[0]).not.toHaveProperty('excerpt');
    const requeues = mock
      .commandCalls(UpdateCommand)
      .filter((c) => (c.args[0].input.UpdateExpression ?? '').includes('REMOVE GSI1PK'));
    expect(requeues).toHaveLength(2);
  });

  it('does nothing while another poll holds the lease', async () => {
    mock.on(PutCommand).rejects(awsError('ConditionalCheckFailedException'));
    expect(await runPoll(deps(fakeHttp({})))).toMatchObject({ ran: false });
  });
});
