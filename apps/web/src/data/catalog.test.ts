import { describe, expect, it } from 'vitest';

import {
  groupCatalog,
  matchesCatalogFilter,
  savingUsd,
  summarizeCatalog,
  toCatalogRows,
  NO_CATALOG_FILTER,
  type CatalogRow,
} from './catalog.ts';
import { toRows } from './offers.ts';
import { snapshot } from './snapshot.ts';

const TODAY = '2026-09-29';
const offers = toRows(snapshot.offers, TODAY);
const rows = toCatalogRows(snapshot.catalog, offers);
const byId = (id: string): CatalogRow => {
  const row = rows.find((r) => r.id === id);
  if (row === undefined) throw new Error(`missing fixture ${id}`);
  return row;
};

describe('toCatalogRows', () => {
  it('reads coverage off the offers that match each credential', () => {
    expect(byId('fx-cert-cloud-architect').coverage).toBe('free-now');
    expect(byId('fx-cert-security-analyst').coverage).toBe('opening');
    expect(byId('fx-cert-developer-associate').coverage).toBe('needs-check');
    expect(byId('fx-cert-python-essentials').coverage).toBe('none');
  });

  it('ignores expired offers', () => {
    const pm = byId('fx-cert-project-manager');
    expect(offers.some((row) => row.certifications.includes(pm.name))).toBe(true);
    expect(pm.offers).toEqual([]);
    expect(pm.coverage).toBe('none');
  });

  it('links the offers it matched', () => {
    const cloud = byId('fx-cert-cloud-architect');
    expect(cloud.offers.map((o) => o.row.id)).toEqual(['fx-active-long']);
    expect(cloud.offers[0]?.match).toBe('named');
  });
});

describe('matchesCatalogFilter', () => {
  it.each([
    ['technology', { technology: 'python' } as const, ['fx-cert-python-essentials']],
    ['kind', { kind: 'course' } as const, ['fx-cert-python-essentials']],
    [
      'a live offer',
      { coveredOnly: true } as const,
      ['fx-cert-cloud-architect', 'fx-cert-security-analyst', 'fx-cert-developer-associate'],
    ],
  ])('filters by %s', (_name, patch, expected) => {
    const filter = { ...NO_CATALOG_FILTER, ...patch };
    expect(rows.filter((row) => matchesCatalogFilter(row, filter)).map((row) => row.id)).toEqual(
      expected,
    );
  });
});

describe('groupCatalog', () => {
  it('orders categories for developers first and puts claimable rows on top', () => {
    const groups = groupCatalog(rows);
    expect(groups.map((group) => group.category)).toEqual(['dev', 'cloud', 'security', 'pm']);
    expect(groups[0]?.rows.map((row) => row.id)).toEqual([
      'fx-cert-developer-associate',
      'fx-cert-python-essentials',
    ]);
  });
});

describe('summarizeCatalog', () => {
  it('counts what is covered and what is free right now', () => {
    expect(summarizeCatalog(rows)).toEqual({ total: 5, covered: 3, freeNow: 1 });
  });
});

describe('savingUsd', () => {
  it('is the list price only when something makes it free today', () => {
    expect(savingUsd(byId('fx-cert-cloud-architect'))).toBe(200);
    expect(savingUsd(byId('fx-cert-security-analyst'))).toBeNull();
    expect(savingUsd(byId('fx-cert-python-essentials'))).toBeNull();
    expect(savingUsd(byId('fx-cert-project-manager'))).toBeNull();
  });
});
