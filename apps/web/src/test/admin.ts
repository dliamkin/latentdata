import { vi } from 'vitest';

import type { Candidate } from '@cert-tracker/core';

export const API = 'https://api.example.invalid';
export const AUTH = 'https://auth.example.invalid';
export const CLIENT_ID = 'test-client';

// what a build with admin sign-in configured looks like
export function stubAdminEnv(): void {
  vi.stubEnv('VITE_API_BASE_URL', API);
  vi.stubEnv('VITE_COGNITO_DOMAIN', AUTH);
  vi.stubEnv('VITE_COGNITO_CLIENT_ID', CLIENT_ID);
}

// shaped like a JWT and carrying a real exp; the signature is never checked in the browser
export function fakeToken(secondsFromNow = 1800): string {
  const encode = (value: unknown): string =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const exp = Math.floor(Date.now() / 1000) + secondsFromNow;
  return `${encode({ alg: 'RS256' })}.${encode({ sub: 'admin', token_use: 'id', exp })}.signature`;
}

export function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    candidateId: '01J9Z0G6V2QK8X7N3B4C5D6E7F',
    name: 'Vendor free exam week',
    vendor: 'Vendor',
    category: 'cloud',
    tracks: ['it'],
    technologies: [],
    certifications: ['Vendor Associate'],
    examCode: 'VA-100',
    whatIsFree: 'full-exam',
    cost: null,
    credentialWeight: 'high',
    eligibility: ['public'],
    regions: 'Global',
    windowStart: '2026-09-01',
    windowEnd: '2026-12-31',
    status: 'active',
    recurring: {
      isRecurring: false,
      cadence: null,
      expectedNextWindow: null,
      expectedNextWindowDate: null,
    },
    requirements: 'Register with a work email.',
    url: 'https://vendor.example/offer',
    sourceUrl: 'https://vendor.example/terms',
    lastVerified: '2026-09-29',
    verificationNote: '',
    notes: '',
    stage: 'verified',
    confidence: 'medium',
    matchesExistingId: null,
    signalIds: ['01J9Z0G6V2QK8X7N3B4C5D6E7G'],
    promptVersion: 'v1',
    model: 'model-under-test',
    llmRationale: 'The page states the exam is free during the event.',
    createdAt: '2026-09-29T04:17:00.000Z',
    ...overrides,
  };
}

interface Route {
  status?: number;
  body: unknown;
}

// a fetch that answers by "METHOD url-prefix"; anything unlisted is a test bug, so it throws
export function stubFetch(routes: Record<string, Route>): ReturnType<typeof vi.fn> {
  const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const key = `${init?.method ?? 'GET'} ${url}`;
    const match = Object.keys(routes).find((prefix) => key.startsWith(prefix));
    if (match === undefined) return Promise.reject(new Error(`unexpected request: ${key}`));
    const route = routes[match];
    return Promise.resolve(
      new Response(JSON.stringify(route?.body), {
        status: route?.status ?? 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
