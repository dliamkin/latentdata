import { z } from 'zod';

import { OfferSchema, SourceSchema, type Offer, type Source } from '@cert-tracker/core';

export const OffersSeedSchema = z.object({ offers: z.array(OfferSchema) });

const SeedSourceSchema = SourceSchema.omit({
  keywordsInclude: true,
  keywordsExclude: true,
  pollIntervalMinutes: true,
  state: true,
}).extend({
  keywordsInclude: z.array(z.string()).optional(),
  keywordsExclude: z.array(z.string()).optional(),
  pollIntervalMinutes: z.number().int().positive().optional(),
});

export const SourcesSeedSchema = z.object({
  defaults: z.object({
    pollIntervalMinutes: z.number().int().positive(),
    keywordsInclude: z.array(z.string()),
    keywordsExclude: z.array(z.string()),
  }),
  sources: z.array(SeedSourceSchema),
});

export type SourcesSeed = z.infer<typeof SourcesSeedSchema>;

const union = (a: readonly string[], b: readonly string[] = []): string[] => [
  ...new Set([...a, ...b].map((keyword) => keyword.toLowerCase())),
];

// the seed's defaults are folded into every source here, once; at runtime poll reads the
// source item and never looks at the seed file
export function normalizeSources(seed: SourcesSeed): Source[] {
  return seed.sources.map((source) =>
    SourceSchema.parse({
      ...source,
      pollIntervalMinutes: source.pollIntervalMinutes ?? seed.defaults.pollIntervalMinutes,
      keywordsInclude: union(seed.defaults.keywordsInclude, source.keywordsInclude),
      keywordsExclude: union(seed.defaults.keywordsExclude, source.keywordsExclude),
      state: { consecutiveFailures: 0 },
    }),
  );
}

export function normalizeOffers(offers: readonly Offer[], now: Date): Offer[] {
  return offers.map((offer) => OfferSchema.parse({ ...offer, updatedAt: now.toISOString() }));
}
