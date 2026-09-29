import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { mockClient, type AwsClientStub } from 'aws-sdk-client-mock';

import type { Offer, Source } from '@cert-tracker/core';

import { createDocClient, type DocClient } from '../src/lib/repo/client.ts';

export const TABLE = 'cert-tracker-test';

export function offer(overrides: Partial<Offer> = {}): Offer {
  return {
    id: 'vendor-offer-2026',
    name: 'Vendor free exam',
    vendor: 'Vendor',
    category: 'cloud',
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
    requirements: 'Register.',
    url: 'https://vendor.example/offer',
    sourceUrl: 'https://vendor.example/terms',
    lastVerified: '2026-09-29',
    verificationNote: '',
    notes: '',
    addedBy: 'manual',
    addedAt: '2026-09-05',
    ...overrides,
  };
}

export function source(overrides: Partial<Source> = {}): Source {
  return {
    sourceId: 'rss-vendor-blog',
    kind: 'rss',
    vendor: 'Vendor',
    url: 'https://vendor.example/feed',
    pollIntervalMinutes: 60,
    enabled: true,
    tags: [],
    keywordsInclude: ['voucher'],
    keywordsExclude: [],
    state: { consecutiveFailures: 0 },
    ...overrides,
  };
}

export interface DocMock {
  doc: DocClient;
  mock: AwsClientStub<DynamoDBDocumentClient>;
}

export function docMock(): DocMock {
  // the mock patches the prototype, so this client never reaches for credentials or a network
  const mock = mockClient(DynamoDBDocumentClient);
  const doc = createDocClient(new DynamoDBClient({ region: 'us-east-1' }));
  return { doc, mock };
}

export function awsError(name: string, extra: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(name), { name, ...extra });
}

export function transactionCancelled(codes: string[]): Error {
  return awsError('TransactionCanceledException', {
    CancellationReasons: codes.map((Code) => ({ Code })),
  });
}
