import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TABLE, docMock } from '../../../test/helpers.ts';
import { politeHttp } from '../polite.ts';
import { createBudgetGuard } from './budget.ts';
import { costMicroUsd, parsePricing } from './pricing.ts';
import { PROMPTS, parsePrompt } from './prompts.ts';

const PRICING = parsePricing(
  JSON.stringify({
    'claude-haiku-4-5': { inputPerMTok: 1, outputPerMTok: 5 },
    'claude-sonnet-5-5': {
      inputPerMTok: 2,
      outputPerMTok: 10,
      cacheReadPerMTok: 0.2,
      cacheWritePerMTok: 2.5,
      webSearchPerRequest: 0.01,
    },
  }),
);

const usage = (overrides: Partial<Parameters<typeof costMicroUsd>[2]> = {}) => ({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  webSearchRequests: 0,
  ...overrides,
});

describe('pricing', () => {
  it('prices tokens per million and rounds up to a micro-dollar', () => {
    expect(
      costMicroUsd(PRICING, 'claude-haiku-4-5', usage({ inputTokens: 1000, outputTokens: 200 })),
    ).toBe(2000);
    expect(costMicroUsd(PRICING, 'claude-haiku-4-5', usage({ inputTokens: 1 }))).toBe(1);
  });

  it('uses cache and search prices when given, and sensible defaults otherwise', () => {
    const sonnet = costMicroUsd(
      PRICING,
      'claude-sonnet-5-5',
      usage({ cacheReadTokens: 1_000_000, cacheWriteTokens: 1_000_000, webSearchRequests: 2 }),
    );
    expect(sonnet).toBe(2_700_000 + 20_000);
    const haiku = costMicroUsd(
      PRICING,
      'claude-haiku-4-5',
      usage({ cacheReadTokens: 1_000_000, cacheWriteTokens: 1_000_000 }),
    );
    expect(haiku).toBe(100_000 + 1_250_000);
  });

  it('refuses to price an unknown model', () => {
    expect(() => costMicroUsd(PRICING, 'claude-mystery', usage())).toThrow(/no pricing/);
    expect(() => parsePricing('{"x":{"inputPerMTok":-1,"outputPerMTok":1}}')).toThrow();
  });
});

describe('prompts', () => {
  it('parses front-matter and keeps the body', () => {
    const prompt = parsePrompt('---\nversion: 3\nmodelClass: sonnet\n---\nBe brief.\n');
    expect(prompt).toEqual({ version: '3', modelClass: 'sonnet', system: 'Be brief.' });
    expect(() => parsePrompt('no front matter')).toThrow();
    expect(() => parsePrompt('---\nversion: 1\nmodelClass: gpt\n---\nx')).toThrow(/modelClass/);
  });

  it('loads the three shipped prompts with their model classes', () => {
    expect(PROMPTS.triage.modelClass).toBe('haiku');
    expect(PROMPTS.verify.modelClass).toBe('sonnet');
    expect(PROMPTS.search.modelClass).toBe('sonnet');
    expect(PROMPTS.triage.system).toMatch(/certification/);
    expect(PROMPTS.verify.system).toMatch(/matchesExistingId/);
  });
});

describe('budget guard', () => {
  const { doc, mock } = docMock();
  const guard = createBudgetGuard({ doc, table: TABLE, dailyCapUsd: 1, pricing: PRICING });
  const now = new Date('2026-09-30T10:00:00.000Z');

  beforeEach(() => {
    mock.reset();
  });

  it('allows calls until today reaches the cap', async () => {
    mock
      .on(GetCommand)
      .resolvesOnce({})
      .resolvesOnce({ Item: { costMicroUsd: 999_999 } })
      .resolvesOnce({
        Item: { costMicroUsd: 1_000_000 },
      });
    expect(await guard.check(now)).toMatchObject({
      date: '2026-09-30',
      allowed: true,
      spentMicroUsd: 0,
    });
    expect((await guard.check(now)).allowed).toBe(true);
    expect((await guard.check(now)).allowed).toBe(false);
  });

  it('records spend with atomic adds on the day item', async () => {
    mock.on(UpdateCommand).resolves({});
    const micro = await guard.record(
      now,
      'claude-haiku-4-5',
      usage({ inputTokens: 5000, outputTokens: 1000 }),
    );
    expect(micro).toBe(10_000);
    const input = mock.commandCalls(UpdateCommand)[0]?.args[0].input;
    expect(input?.Key).toEqual({ PK: 'BUDGET#2026-09-30', SK: 'META' });
    expect(input?.UpdateExpression).toMatch(
      /^ADD tokensIn :in, tokensOut :out, costMicroUsd :cost, calls :one/,
    );
    expect(input?.ExpressionAttributeValues).toMatchObject({
      ':in': 5000,
      ':out': 1000,
      ':cost': 10_000,
    });
  });
});

describe('polite http', () => {
  it('spaces requests to one host a second apart and lets other hosts through', async () => {
    let clock = 0;
    const sleep = vi.fn((ms: number) => {
      clock += ms;
      return Promise.resolve();
    });
    const inner = {
      get: vi.fn(() =>
        Promise.resolve({ status: 200, headers: new Headers(), text: '', notModified: false }),
      ),
    };
    const http = politeHttp(inner, sleep, () => clock);
    await Promise.all([
      http.get('https://a.example/1'),
      http.get('https://a.example/2'),
      http.get('https://b.example/1'),
    ]);
    expect(inner.get).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(1000);
  });
});
