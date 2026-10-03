import { z } from 'zod';

import {
  CatalogEntrySchema,
  OfferSchema,
  SourceSchema,
  type CatalogEntry,
  type CostToYou,
  type Offer,
  type Source,
  type Technology,
  type Track,
} from '@cert-tracker/core';

export const OffersSeedSchema = z.object({ offers: z.array(OfferSchema) });
export const CatalogSeedSchema = z.object({ entries: z.array(CatalogEntrySchema) });

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

export interface TaxonomyBackfill {
  id: string;
  tracks: Track[];
  technologies: Technology[];
}

// offers stored before the taxonomy existed carry neither list; those, and only those, take
// the seed's values, so a later edit in the table is never overwritten by a re-import
export function planTaxonomyBackfill(
  stored: readonly Offer[],
  seed: readonly Offer[],
): TaxonomyBackfill[] {
  const wanted = new Map(seed.map((offer) => [offer.id, offer]));
  const plan: TaxonomyBackfill[] = [];
  for (const offer of stored) {
    if (offer.tracks.length > 0 || offer.technologies.length > 0) continue;
    const from = wanted.get(offer.id);
    if (from === undefined || (from.tracks.length === 0 && from.technologies.length === 0)) {
      continue;
    }
    plan.push({ id: offer.id, tracks: from.tracks, technologies: from.technologies });
  }
  return plan;
}

export interface CostBackfill {
  id: string;
  costToYou: CostToYou;
}

// offers stored before costToYou existed take the seed's value; one already set in the table is
// never overwritten by a re-import
export function planCostBackfill(stored: readonly Offer[], seed: readonly Offer[]): CostBackfill[] {
  const wanted = new Map(seed.map((offer) => [offer.id, offer.costToYou]));
  const plan: CostBackfill[] = [];
  for (const offer of stored) {
    const costToYou = wanted.get(offer.id);
    if (offer.costToYou === undefined && costToYou !== undefined) {
      plan.push({ id: offer.id, costToYou });
    }
  }
  return plan;
}

export interface KeywordTopUp {
  sourceId: string;
  keywordsInclude: string[];
  keywordsExclude: string[];
}

// keywords added to the seed after a source was imported; additive only
export function planKeywordTopUp(
  stored: readonly Source[],
  seed: readonly Source[],
): KeywordTopUp[] {
  const wanted = new Map(seed.map((source) => [source.sourceId, source]));
  const plan: KeywordTopUp[] = [];
  for (const source of stored) {
    const from = wanted.get(source.sourceId);
    if (from === undefined) continue;
    const keywordsInclude = union(source.keywordsInclude, from.keywordsInclude);
    const keywordsExclude = union(source.keywordsExclude, from.keywordsExclude);
    if (
      keywordsInclude.length !== source.keywordsInclude.length ||
      keywordsExclude.length !== source.keywordsExclude.length
    ) {
      plan.push({ sourceId: source.sourceId, keywordsInclude, keywordsExclude });
    }
  }
  return plan;
}

export interface CatalogSync {
  put: CatalogEntry[];
  remove: string[];
}

// the seed file is the catalog's editor: whatever differs is written, whatever left is deleted
export function planCatalogSync(
  stored: readonly CatalogEntry[],
  seed: readonly CatalogEntry[],
): CatalogSync {
  const current = new Map(stored.map((entry) => [entry.id, JSON.stringify(entry)]));
  const wanted = new Set(seed.map((entry) => entry.id));
  return {
    put: seed.filter((entry) => current.get(entry.id) !== JSON.stringify(entry)),
    remove: stored.filter((entry) => !wanted.has(entry.id)).map((entry) => entry.id),
  };
}
