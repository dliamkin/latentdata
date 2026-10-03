import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { VENDOR_DOMAINS } from '@cert-tracker/core';

import { catalogEntry, offer, source } from '../../test/helpers.ts';
import {
  CatalogSeedSchema,
  OffersSeedSchema,
  SourcesSeedSchema,
  normalizeOffers,
  normalizeSources,
  planCatalogSync,
  planCostBackfill,
  planKeywordTopUp,
  planTaxonomyBackfill,
} from './seed.ts';

const seed = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../../../seed/${name}.seed.json`, import.meta.url), 'utf8'));

describe('normalizeSources', () => {
  it('folds the defaults into each source', () => {
    const [first, second] = normalizeSources({
      defaults: {
        pollIntervalMinutes: 120,
        keywordsInclude: ['Voucher', 'free exam'],
        keywordsExclude: ['dumps'],
      },
      sources: [
        {
          sourceId: 'a',
          kind: 'rss',
          vendor: 'A',
          url: 'https://a.example/feed',
          enabled: true,
          tags: [],
        },
        {
          sourceId: 'b',
          kind: 'page-diff',
          vendor: null,
          url: 'https://b.example/',
          enabled: false,
          tags: ['vendor-page'],
          pollIntervalMinutes: 360,
          keywordsInclude: ['voucher', 'Registration'],
          notes: 'returned 404',
        },
      ],
    });
    expect(first).toMatchObject({
      pollIntervalMinutes: 120,
      keywordsInclude: ['voucher', 'free exam'],
      keywordsExclude: ['dumps'],
      state: { consecutiveFailures: 0 },
    });
    expect(second).toMatchObject({
      pollIntervalMinutes: 360,
      keywordsInclude: ['voucher', 'free exam', 'registration'],
      notes: 'returned 404',
    });
  });
});

describe('normalizeOffers', () => {
  it('stamps updatedAt', () => {
    const [normalized] = normalizeOffers([offer()], new Date('2026-09-29T00:00:00.000Z'));
    expect(normalized?.updatedAt).toBe('2026-09-29T00:00:00.000Z');
  });
});

describe('planTaxonomyBackfill', () => {
  const seeded = [
    offer({ id: 'a', tracks: ['software'], technologies: ['csharp'] }),
    offer({ id: 'b', tracks: ['it'], technologies: [] }),
    offer({ id: 'c', tracks: [], technologies: [] }),
  ];

  it('fills offers that carry neither list and leaves classified ones alone', () => {
    const stored = [
      offer({ id: 'a', tracks: [], technologies: [] }),
      offer({ id: 'b', tracks: ['software'], technologies: [] }),
      offer({ id: 'c', tracks: [], technologies: [] }),
      offer({ id: 'scanned', tracks: [], technologies: [] }),
    ];
    expect(planTaxonomyBackfill(stored, seeded)).toEqual([
      { id: 'a', tracks: ['software'], technologies: ['csharp'] },
    ]);
  });

  it('has nothing to do the second time', () => {
    expect(planTaxonomyBackfill(seeded, seeded)).toEqual([]);
  });
});

describe('planCostBackfill', () => {
  const seeded = [
    offer({ id: 'ticketed', costToYou: 'purchase-first' }),
    offer({ id: 'free', costToYou: 'nothing' }),
  ];

  it('fills offers stored before the field existed, from the seed only', () => {
    const stored = [offer({ id: 'ticketed' }), offer({ id: 'free' }), offer({ id: 'scanned' })];
    expect(planCostBackfill(stored, seeded)).toEqual([
      { id: 'ticketed', costToYou: 'purchase-first' },
      { id: 'free', costToYou: 'nothing' },
    ]);
  });

  it('never overwrites a value already in the table', () => {
    const stored = [offer({ id: 'ticketed', costToYou: 'nothing' }), seeded[1] ?? offer()];
    expect(planCostBackfill(stored, seeded)).toEqual([]);
  });
});

describe('the seed file', () => {
  it('states what every offer costs, so nothing on the site rests on a guess', () => {
    const { offers } = OffersSeedSchema.parse(seed('offers'));
    expect(offers.filter((o) => o.costToYou === undefined).map((o) => o.id)).toEqual([]);
  });
});

describe('planKeywordTopUp', () => {
  it('adds what the seed gained and never removes', () => {
    const stored = [
      source({ sourceId: 'a', keywordsInclude: ['voucher', 'local'], keywordsExclude: ['dumps'] }),
      source({ sourceId: 'b', keywordsInclude: ['voucher', 'free course'] }),
      source({ sourceId: 'not-in-seed' }),
    ];
    const seeded = [
      source({ sourceId: 'a', keywordsInclude: ['voucher', 'free course'], keywordsExclude: [] }),
      source({ sourceId: 'b', keywordsInclude: ['voucher', 'free course'] }),
    ];
    expect(planKeywordTopUp(stored, seeded)).toEqual([
      {
        sourceId: 'a',
        keywordsInclude: ['voucher', 'local', 'free course'],
        keywordsExclude: ['dumps'],
      },
    ]);
  });
});

describe('planCatalogSync', () => {
  it('writes new and changed entries and removes the ones the seed dropped', () => {
    const stored = [
      catalogEntry({ id: 'same' }),
      catalogEntry({ id: 'repriced', listPriceUsd: 150 }),
      catalogEntry({ id: 'dropped' }),
    ];
    const seeded = [
      catalogEntry({ id: 'same' }),
      catalogEntry({ id: 'repriced', listPriceUsd: 165 }),
      catalogEntry({ id: 'added' }),
    ];
    const plan = planCatalogSync(stored, seeded);
    expect(plan.put.map((entry) => entry.id)).toEqual(['repriced', 'added']);
    expect(plan.remove).toEqual(['dropped']);
  });
});

describe('the committed seed files', () => {
  const offers = OffersSeedSchema.parse(seed('offers')).offers;
  const sources = normalizeSources(SourcesSeedSchema.parse(seed('sources')));
  const catalog = CatalogSeedSchema.parse(seed('catalog')).entries;

  it('pass the schemas the importer uses', () => {
    expect(offers).toHaveLength(59);
    expect(sources).toHaveLength(52);
    expect(catalog).toHaveLength(79);
    expect(new Set(offers.map((o) => o.id)).size).toBe(59);
    expect(new Set(sources.map((s) => s.sourceId)).size).toBe(52);
    expect(new Set(catalog.map((c) => c.id)).size).toBe(79);
    expect(sources.every((s) => s.keywordsInclude.includes('voucher'))).toBe(true);
  });

  it('classify every offer, and reach both audiences', () => {
    // an offer with no track is deliberate (marketing, business applications), an offer with a
    // technology nobody else has is usually a typo in the id
    expect(offers.filter((o) => o.tracks.includes('software')).length).toBeGreaterThan(20);
    expect(offers.filter((o) => o.tracks.includes('it')).length).toBeGreaterThan(20);
    expect(offers.filter((o) => o.tracks.length === 0).map((o) => o.id)).toEqual([
      'microsoft-sales-cert-week-fy27',
      'github-universe-preview-gh700-voucher-2026',
      'google-skillshop',
      'hubspot-academy',
      'google-cloud-generative-ai-leader-learning-path',
    ]);
  });

  it('has a vendor-domain entry for every vendor the seed names', () => {
    // the auto-accept rule only fires for a vendor in this map, so a new seed vendor without an
    // entry silently means every candidate from it waits for review
    for (const vendor of new Set(offers.map((o) => o.vendor))) {
      expect(VENDOR_DOMAINS[vendor], vendor).toBeDefined();
    }
  });

  it('give every catalog entry a rank that is unique inside its category', () => {
    const byCategory = new Map<string, number[]>();
    for (const entry of catalog) {
      byCategory.set(entry.category, [...(byCategory.get(entry.category) ?? []), entry.rank]);
    }
    for (const [category, ranks] of byCategory) {
      expect(new Set(ranks).size, category).toBe(ranks.length);
      expect(Math.min(...ranks), category).toBe(1);
    }
  });

  it('name a vendor the catalog and the offers spell the same way', () => {
    // a mismatch here is why a live offer would not light up its catalog row
    const offerVendors = new Set(offers.map((o) => o.vendor.toLowerCase()));
    const unmatched = [...new Set(catalog.map((c) => c.vendor))].filter(
      (vendor) => !offerVendors.has(vendor.toLowerCase()),
    );
    // vendors nobody has an offer from yet; listed so a new offer's spelling is checked here
    expect(unmatched.sort()).toEqual([
      'CNCF',
      'CompTIA',
      'EC-Council',
      'ISACA',
      'Meta',
      'NVIDIA',
      'OffSec',
      'PMI',
      'PeopleCert',
      'Python Institute',
      'Red Hat',
      'Scaled Agile',
      'Scrum Alliance',
      'Scrum.org',
      'Unity',
    ]);
  });
});
