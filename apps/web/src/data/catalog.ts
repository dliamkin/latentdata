import {
  catalogMatch,
  type CatalogEntry,
  type CatalogMatch,
  type OfferCategory,
  type Technology,
} from '@cert-tracker/core';

import type { OfferRow } from './offers.ts';

// what a reader wants to know first: can I get this one for nothing right now
export const COVERAGES = ['free-now', 'reduced-now', 'opening', 'needs-check', 'none'] as const;
export type Coverage = (typeof COVERAGES)[number];

// the catalog leads with what software people are asked for, then the rest of IT
export const CATALOG_CATEGORY_ORDER: readonly OfferCategory[] = [
  'dev',
  'cloud',
  'ai',
  'data',
  'security',
  'infrastructure',
  'pm',
  'marketing',
  'other',
];

export interface CatalogOffer {
  row: OfferRow;
  match: CatalogMatch;
}

export interface CatalogRow extends CatalogEntry {
  // live and announced offers that cover this credential, best first
  offers: CatalogOffer[];
  coverage: Coverage;
  coverageRank: number;
}

function coverageOf(row: OfferRow): Coverage {
  switch (row.derivedStatus) {
    case 'active':
    case 'evergreen':
      return row.whatIsFree === 'full-exam' || row.whatIsFree === 'training-and-badge'
        ? 'free-now'
        : 'reduced-now';
    case 'upcoming':
      return 'opening';
    case 'unverified':
      return 'needs-check';
    case 'expired':
      return 'none';
  }
}

const rankOf = (coverage: Coverage): number => COVERAGES.indexOf(coverage);

export function toCatalogRows(
  entries: readonly CatalogEntry[],
  offers: readonly OfferRow[],
): CatalogRow[] {
  return entries.map((entry) => {
    const matched: (CatalogOffer & { coverage: Coverage })[] = [];
    for (const row of offers) {
      const match = catalogMatch(entry, row);
      if (match === null) continue;
      const coverage = coverageOf(row);
      if (coverage === 'none') continue;
      matched.push({ row, match, coverage });
    }
    // a named offer outranks a vendor-wide one at the same coverage: it is the surer answer
    matched.sort(
      (a, b) =>
        rankOf(a.coverage) - rankOf(b.coverage) ||
        (a.match === b.match ? 0 : a.match === 'named' ? -1 : 1),
    );
    const coverage = matched[0]?.coverage ?? 'none';
    return {
      ...entry,
      offers: matched.map(({ row, match }) => ({ row, match })),
      coverage,
      coverageRank: rankOf(coverage),
    };
  });
}

// the audience lens is applied by the shell (matchesAudience); these are the controls that
// belong to the catalog itself
export interface CatalogFilter {
  technology: Technology | null;
  kind: CatalogEntry['kind'] | null;
  coveredOnly: boolean;
}

export const NO_CATALOG_FILTER: CatalogFilter = {
  technology: null,
  kind: null,
  coveredOnly: false,
};

export function matchesCatalogFilter(row: CatalogRow, filter: CatalogFilter): boolean {
  if (filter.technology !== null && !row.technologies.includes(filter.technology)) return false;
  if (filter.kind !== null && row.kind !== filter.kind) return false;
  if (filter.coveredOnly && row.coverage === 'none') return false;
  return true;
}

export interface CatalogGroup {
  category: OfferCategory;
  rows: CatalogRow[];
}

export function groupCatalog(rows: readonly CatalogRow[]): CatalogGroup[] {
  const groups = new Map<OfferCategory, CatalogRow[]>();
  for (const row of rows) {
    const list = groups.get(row.category) ?? [];
    list.push(row);
    groups.set(row.category, list);
  }
  return CATALOG_CATEGORY_ORDER.filter((category) => groups.has(category)).map((category) => ({
    category,
    // what is claimable now first, then the order the catalog itself gives
    rows: (groups.get(category) ?? []).sort(
      (a, b) => a.coverageRank - b.coverageRank || a.rank - b.rank || a.name.localeCompare(b.name),
    ),
  }));
}

export interface CatalogCounts {
  total: number;
  covered: number;
  freeNow: number;
}

export function summarizeCatalog(rows: readonly CatalogRow[]): CatalogCounts {
  return {
    total: rows.length,
    covered: rows.filter((row) => row.coverage !== 'none').length,
    freeNow: rows.filter((row) => row.coverage === 'free-now').length,
  };
}

// what the entry saves a reader if an offer covers it; null when no price is published
export function savingUsd(row: CatalogRow): number | null {
  if (row.listPriceUsd === null || row.listPriceUsd === 0) return null;
  return row.coverage === 'free-now' ? row.listPriceUsd : null;
}
