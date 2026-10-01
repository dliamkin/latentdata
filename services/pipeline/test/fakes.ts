import { vi } from 'vitest';

import type { HttpClient, HttpResponse } from '../src/lib/http.ts';
import type { BudgetGuard } from '../src/lib/llm/budget.ts';
import type { Extraction, TriageVerdict } from '../src/lib/llm/schemas.ts';
import type { QueueSender } from '../src/lib/sqs.ts';

export function response(
  status: number,
  text = '',
  headers: Record<string, string> = {},
): HttpResponse {
  return { status, headers: new Headers(headers), text, notModified: status === 304 };
}

export function fakeHttp(
  routes: Record<string, HttpResponse | Error>,
): HttpClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    get: (url) => {
      calls.push(url);
      const key = Object.keys(routes).find((prefix) => url.startsWith(prefix));
      const entry = key === undefined ? undefined : routes[key];
      if (entry === undefined) return Promise.reject(new Error(`unrouted ${url}`));
      return entry instanceof Error ? Promise.reject(entry) : Promise.resolve(entry);
    },
  };
}

export function fakeQueue(): QueueSender & { sent: { queueUrl: string; bodies: unknown[] }[] } {
  const sent: { queueUrl: string; bodies: unknown[] }[] = [];
  return {
    sent,
    send: (queueUrl, messages) => {
      sent.push({ queueUrl, bodies: messages.map((m) => JSON.parse(m.body) as unknown) });
      return Promise.resolve();
    },
  };
}

export function fakeBudget(allowed = true): BudgetGuard & { recorded: string[] } {
  const recorded: string[] = [];
  return {
    recorded,
    check: (now) =>
      Promise.resolve({
        date: now.toISOString().slice(0, 10),
        allowed,
        spentMicroUsd: allowed ? 0 : 1_000_000,
        capMicroUsd: 1_000_000,
      }),
    record: (_now, model) => {
      recorded.push(model);
      return Promise.resolve(1000);
    },
  };
}

export const USAGE = {
  inputTokens: 100,
  outputTokens: 20,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  webSearchRequests: 0,
};

export function extraction(overrides: Partial<Extraction> = {}): Extraction {
  return {
    isOffer: true,
    name: 'Vendor Cloud Week 2026',
    vendor: 'Microsoft',
    category: 'cloud',
    tracks: ['it'],
    technologies: ['azure'],
    certifications: ['Azure Fundamentals'],
    examCode: 'AZ-900',
    whatIsFree: 'full-exam',
    cost: null,
    credentialWeight: 'medium',
    eligibility: ['public'],
    regions: 'Global',
    windowStart: '2026-10-01',
    windowEnd: '2026-10-31',
    recurring: {
      isRecurring: false,
      cadence: null,
      expectedNextWindow: null,
      expectedNextWindowDate: null,
    },
    requirements: 'Register on the vendor page.',
    url: 'https://learn.microsoft.com/credentials/deals',
    sourceUrl: 'https://learn.microsoft.com/credentials/deals',
    notes: '',
    matchesExistingId: null,
    confidence: 'high',
    rationale: 'The page states dates, eligibility and the claim path.',
    ...overrides,
  };
}

export function fakeLlm(
  options: {
    verdicts?: TriageVerdict[];
    extractions?: (Extraction | null)[];
    searchNotes?: string;
  } = {},
) {
  const extractions = [...(options.extractions ?? [extraction()])];
  const self = {
    extractCalls: [] as unknown[],
    searchCalls: 0,
    triage: vi.fn((model: string) =>
      Promise.resolve({ result: options.verdicts ?? [], usage: USAGE, promptVersion: '1', model }),
    ),
    extract: vi.fn((model: string, input: unknown) => {
      self.extractCalls.push(input);
      const next = extractions.length > 1 ? extractions.shift() : extractions[0];
      return Promise.resolve({
        result: next ?? null,
        rawText: next === null || next === undefined ? 'garbage' : JSON.stringify(next),
        usage: USAGE,
        promptVersion: '1',
        model,
      });
    }),
    search: vi.fn((model: string) => {
      self.searchCalls += 1;
      return Promise.resolve({
        result: options.searchNotes ?? '',
        usage: USAGE,
        promptVersion: '1',
        model,
      });
    }),
  };
  return self;
}
