import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { offer } from '../../test/helpers.ts';
import { OffersSeedSchema, SourcesSeedSchema, normalizeOffers, normalizeSources } from './seed.ts';

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

describe('the committed seed files', () => {
  it('pass the schemas the importer uses', () => {
    const offers = OffersSeedSchema.parse(seed('offers')).offers;
    const sources = normalizeSources(SourcesSeedSchema.parse(seed('sources')));
    expect(offers).toHaveLength(38);
    expect(sources).toHaveLength(25);
    expect(new Set(offers.map((o) => o.id)).size).toBe(38);
    expect(new Set(sources.map((s) => s.sourceId)).size).toBe(25);
    expect(sources.every((s) => s.keywordsInclude.includes('voucher'))).toBe(true);
  });
});
