import { z } from 'zod';

import {
  CONFIDENCES,
  CREDENTIAL_WEIGHTS,
  ELIGIBILITIES,
  OFFER_CATEGORIES,
  WHAT_IS_FREE,
} from '@cert-tracker/core';

// what the models answer with; kept to what JSON Schema can express (no refinements), then
// mapped onto the core schemas which hold the real invariants

export const TriageVerdictSchema = z.object({
  signalId: z.string(),
  relevant: z.boolean(),
  confidence: z.number(),
  reason: z.string(),
});

export const TriageResultSchema = z.object({
  verdicts: z.array(TriageVerdictSchema),
});

export type TriageVerdict = z.infer<typeof TriageVerdictSchema>;

export const ExtractionSchema = z.object({
  isOffer: z.boolean(),
  name: z.string(),
  vendor: z.string(),
  category: z.enum(OFFER_CATEGORIES),
  certifications: z.array(z.string()),
  examCode: z.string().nullable(),
  whatIsFree: z.enum(WHAT_IS_FREE),
  cost: z.string().nullable(),
  credentialWeight: z.enum(CREDENTIAL_WEIGHTS),
  eligibility: z.array(z.enum(ELIGIBILITIES)),
  regions: z.string(),
  windowStart: z.string().nullable(),
  windowEnd: z.string().nullable(),
  recurring: z.object({
    isRecurring: z.boolean(),
    cadence: z.string().nullable(),
    expectedNextWindow: z.string().nullable(),
    expectedNextWindowDate: z.string().nullable(),
  }),
  requirements: z.string(),
  url: z.string(),
  sourceUrl: z.string(),
  notes: z.string(),
  matchesExistingId: z.string().nullable(),
  confidence: z.enum(CONFIDENCES),
  rationale: z.string(),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

export interface TriageInput {
  signalId: string;
  title: string;
  url: string;
  excerpt: string;
}

export interface OfferIndexEntry {
  id: string;
  name: string;
  vendor: string;
  windowEnd: string | null;
}
