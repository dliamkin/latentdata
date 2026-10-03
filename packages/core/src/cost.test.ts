import { describe, expect, it } from 'vitest';

import { costToYouOf, isTotallyFree } from './cost.ts';
import { OfferSchema } from './schemas.ts';

describe('costToYouOf', () => {
  it('uses the stored value when there is one', () => {
    expect(costToYouOf({ whatIsFree: 'full-exam', costToYou: 'purchase-first' })).toBe(
      'purchase-first',
    );
  });

  it.each([
    ['full-exam', 'nothing'],
    ['training-and-badge', 'nothing'],
    ['partial', 'reduced-price'],
    ['training-only', 'certificate-fee'],
  ] as const)('reads %s as %s when nothing is stored', (whatIsFree, expected) => {
    expect(costToYouOf({ whatIsFree })).toBe(expected);
  });

  it('calls only a nothing-to-pay offer totally free', () => {
    expect(isTotallyFree({ whatIsFree: 'full-exam' })).toBe(true);
    expect(isTotallyFree({ whatIsFree: 'full-exam', costToYou: 'purchase-first' })).toBe(false);
    expect(isTotallyFree({ whatIsFree: 'partial' })).toBe(false);
  });
});

describe('the costToYou invariant', () => {
  const base = {
    id: 'vendor-offer',
    name: 'Offer',
    vendor: 'Vendor',
    category: 'dev',
    certifications: ['Cert'],
    examCode: null,
    whatIsFree: 'full-exam',
    cost: null,
    credentialWeight: 'low',
    eligibility: ['public'],
    regions: 'Global',
    windowStart: null,
    windowEnd: null,
    status: 'evergreen',
    recurring: {
      isRecurring: false,
      cadence: null,
      expectedNextWindow: null,
      expectedNextWindowDate: null,
    },
    requirements: 'Register.',
    url: 'https://vendor.example/offer',
    sourceUrl: 'https://vendor.example/terms',
    lastVerified: '2026-10-03',
    verificationNote: '',
    notes: '',
    addedBy: 'manual',
    addedAt: '2026-10-03',
  };

  it('accepts an offer without the field, and a free exam that needs a ticket first', () => {
    expect(OfferSchema.safeParse(base).success).toBe(true);
    expect(OfferSchema.safeParse({ ...base, costToYou: 'purchase-first' }).success).toBe(true);
  });

  it.each([
    [
      'a discount that claims to cost nothing',
      { whatIsFree: 'partial', cost: '50%', costToYou: 'nothing' },
    ],
    ['a free exam at a reduced price', { costToYou: 'reduced-price' }],
    [
      'a certificate fee on a free badge',
      { whatIsFree: 'training-and-badge', costToYou: 'certificate-fee' },
    ],
  ])('rejects %s', (_name, overrides) => {
    expect(OfferSchema.safeParse({ ...base, ...overrides }).success).toBe(false);
  });
});
