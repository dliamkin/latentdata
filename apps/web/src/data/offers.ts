import {
  TECHNOLOGIES,
  addDays,
  catalogMatch,
  compareIsoDates,
  costToYouOf,
  daysBetween,
  daysUntilEnd,
  deriveStatus,
  isExpiringSoon,
  isWatchList,
  type CatalogEntry,
  type CostToYou,
  type Eligibility,
  type Offer,
  type OfferStatus,
  type SnapshotEvent,
  type Technology,
  type Track,
} from '@cert-tracker/core';

export const NEW_DAYS = 7;

const WEIGHT_RANK = { high: 0, medium: 1, low: 2 } as const;
const COST_RANK = {
  nothing: 0,
  'purchase-first': 1,
  'reduced-price': 2,
  'certificate-fee': 3,
} as const;
const WHAT_IS_FREE_RANK = {
  'full-exam': 0,
  partial: 1,
  'training-and-badge': 2,
  'training-only': 3,
} as const;

// the table's row groups, in display order: what to act on first comes first
export const OFFER_GROUPS = ['ending', 'open', 'later', 'always', 'check', 'expired'] as const;
export type OfferGroup = (typeof OFFER_GROUPS)[number];

export function offerGroup(status: OfferStatus, expiringSoon: boolean): OfferGroup {
  switch (status) {
    case 'active':
      return expiringSoon ? 'ending' : 'open';
    case 'upcoming':
      return 'later';
    case 'evergreen':
      return 'always';
    case 'unverified':
      return 'check';
    case 'expired':
      return 'expired';
  }
}

// the standard US list price of what an offer covers; min and max differ when it covers
// credentials priced differently (any exam of a vendor, or several named ones)
export interface PriceRange {
  min: number;
  max: number;
}

// read off the catalog: the credentials the offer names, or failing that the vendor's exams
// when the offer is for any of them. Null when none of those has a published price.
export function listPriceOf(
  offer: Pick<Offer, 'vendor' | 'certifications' | 'examCode'>,
  catalog: readonly CatalogEntry[],
): PriceRange | null {
  const named: CatalogEntry[] = [];
  const wide: CatalogEntry[] = [];
  for (const entry of catalog) {
    const match = catalogMatch(entry, offer);
    if (match === 'named') named.push(entry);
    else if (match === 'vendor-wide') wide.push(entry);
  }
  // a named credential without a price is not answered by the vendor's other prices
  const prices = (named.length > 0 ? named : wide)
    .map((entry) => entry.listPriceUsd)
    .filter((price): price is number => price !== null && price > 0);
  if (prices.length === 0) return null;
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

const PRICE_SORT_CAP = 99_999;

export interface OfferRow extends Offer {
  // always present on a row: the stored value, or what whatIsFree implies for older offers
  costToYou: CostToYou;
  listPrice: PriceRange | null;
  // whole days since the offer was last read against the vendor's page
  checkedDaysAgo: number;
  derivedStatus: OfferStatus;
  expiringSoon: boolean;
  daysLeft: number | null;
  isNew: boolean;
  watch: boolean;
  group: OfferGroup;
  // share of a dated window already elapsed (0..1); null without both dates or outside them
  windowProgress: number | null;
  // sort keys: the table sorts by these, the cells render the enum
  groupRank: number;
  windowEndSort: string;
  weightRank: number;
  // what costs nothing first, within that an exam before a course, and within that the one
  // that normally costs the most
  whatIsFreeRank: number;
}

function windowProgress(offer: Offer, today: string): number | null {
  if (offer.windowStart === null || offer.windowEnd === null) return null;
  const total = daysBetween(offer.windowStart, offer.windowEnd);
  if (total <= 0) return null;
  const elapsed = daysBetween(offer.windowStart, today);
  if (elapsed < 0 || elapsed > total) return null;
  return elapsed / total;
}

export function toRows(
  offers: readonly Offer[],
  today: string,
  catalog: readonly CatalogEntry[] = [],
): OfferRow[] {
  const newSince = addDays(today, -NEW_DAYS);
  return offers.map((offer) => {
    const derivedStatus = deriveStatus(offer, today);
    const expiringSoon = isExpiringSoon(offer, today);
    const group = offerGroup(derivedStatus, expiringSoon);
    const costToYou = costToYouOf(offer);
    const listPrice = listPriceOf(offer, catalog);
    return {
      ...offer,
      costToYou,
      listPrice,
      checkedDaysAgo: Math.max(0, daysBetween(offer.lastVerified, today)),
      derivedStatus,
      expiringSoon,
      daysLeft: daysUntilEnd(offer, today),
      isNew: compareIsoDates(offer.addedAt, newSince) >= 0,
      watch: isWatchList(offer, today),
      group,
      windowProgress: windowProgress(offer, today),
      groupRank: OFFER_GROUPS.indexOf(group),
      windowEndSort: offer.windowEnd ?? '9999-12-31',
      weightRank: WEIGHT_RANK[offer.credentialWeight],
      whatIsFreeRank:
        (COST_RANK[costToYou] * 10 + WHAT_IS_FREE_RANK[offer.whatIsFree]) * (PRICE_SORT_CAP + 1) +
        (PRICE_SORT_CAP - Math.min(Math.round(listPrice?.max ?? 0), PRICE_SORT_CAP)),
    };
  });
}

// the audience lens: every tab shows one track's offers, or all of them
export function matchesAudience(row: Pick<OfferRow, 'tracks'>, audience: Track | null): boolean {
  return audience === null || row.tracks.includes(audience);
}

// what a visitor can say about themselves; 'public' is not a choice, everyone is the public
export type ClaimRole = Exclude<Eligibility, 'public'>;
// null: the visitor has not said, so nothing is hidden. An empty list: none of the roles, so
// only offers open to everyone.
export type Claim = readonly ClaimRole[] | null;

export function matchesClaim(row: Pick<OfferRow, 'eligibility'>, claim: Claim): boolean {
  if (claim === null) return true;
  const roles: readonly Eligibility[] = claim;
  return row.eligibility.some((who) => who === 'public' || roles.includes(who));
}

export function matchesTechnology(
  row: Pick<OfferRow, 'technologies'>,
  technology: Technology | null,
): boolean {
  return technology === null || row.technologies.includes(technology);
}

// technologies that actually appear in the data, in the order the core list declares them,
// each with how many of these rows carry it
export function technologyCounts(
  rows: readonly Pick<OfferRow, 'technologies'>[],
): { technology: Technology; count: number }[] {
  const counts = new Map<Technology, number>();
  for (const row of rows) {
    for (const technology of row.technologies) {
      counts.set(technology, (counts.get(technology) ?? 0) + 1);
    }
  }
  return TECHNOLOGIES.filter((technology) => counts.has(technology)).map((technology) => ({
    technology,
    count: counts.get(technology) ?? 0,
  }));
}

export function matchesVendor(row: Pick<OfferRow, 'vendor'>, vendors: readonly string[]): boolean {
  return vendors.length === 0 || vendors.includes(row.vendor);
}

// every vendor present in these rows, the ones with the most offers first, ties alphabetical
export function vendorCounts(
  rows: readonly Pick<OfferRow, 'vendor'>[],
): { vendor: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.vendor, (counts.get(row.vendor) ?? 0) + 1);
  return [...counts.entries()]
    .map(([vendor, count]) => ({ vendor, count }))
    .sort((a, b) => b.count - a.count || a.vendor.localeCompare(b.vendor));
}

export type QuickFilter = 'active' | 'expiring' | 'upcoming' | 'evergreen' | 'new';

export function matchesQuickFilter(
  row: OfferRow,
  filter: QuickFilter | null,
  newIds: ReadonlySet<string>,
): boolean {
  switch (filter) {
    case null:
      return true;
    case 'active':
      return row.derivedStatus === 'active';
    case 'expiring':
      return row.expiringSoon;
    case 'upcoming':
      return row.derivedStatus === 'upcoming';
    case 'evergreen':
      return row.derivedStatus === 'evergreen';
    case 'new':
      return newIds.has(row.id);
  }
}

// "new this week" is read off the event tail rather than addedAt because that is what
// subscribers were notified about
export function newOfferIds(events: readonly SnapshotEvent[], now: Date): Set<string> {
  const cutoff = now.getTime() - NEW_DAYS * 86_400_000;
  const ids = new Set<string>();
  for (const event of events) {
    if (
      event.type === 'offer.discovered' &&
      event.offerId !== undefined &&
      Date.parse(event.occurredAt) >= cutoff
    ) {
      ids.add(event.offerId);
    }
  }
  return ids;
}

export interface SummaryCounts {
  active: number;
  expiring: number;
  upcoming: number;
  evergreen: number;
  watch: number;
  new: number;
}

export function summarize(rows: readonly OfferRow[], newIds: ReadonlySet<string>): SummaryCounts {
  const counts: SummaryCounts = {
    active: 0,
    expiring: 0,
    upcoming: 0,
    evergreen: 0,
    watch: 0,
    new: 0,
  };
  for (const row of rows) {
    if (row.derivedStatus === 'active') counts.active += 1;
    if (row.expiringSoon) counts.expiring += 1;
    if (row.derivedStatus === 'upcoming') counts.upcoming += 1;
    if (row.derivedStatus === 'evergreen') counts.evergreen += 1;
    if (row.watch) counts.watch += 1;
    if (newIds.has(row.id)) counts.new += 1;
  }
  return counts;
}

// the banner's line: what can be had for nothing today, and what those exams normally cost
export interface FreeNow {
  offers: number;
  usd: number;
}

export function freeNow(rows: readonly OfferRow[]): FreeNow {
  const result: FreeNow = { offers: 0, usd: 0 };
  for (const row of rows) {
    const open = row.derivedStatus === 'active' || row.derivedStatus === 'evergreen';
    if (!open || row.costToYou !== 'nothing') continue;
    result.offers += 1;
    // an offer for any one of several exams is counted at the dearest: it is what it can save
    result.usd += row.listPrice?.max ?? 0;
  }
  return result;
}

export function offersOnDay(rows: readonly OfferRow[], iso: string): OfferRow[] {
  return rows.filter((row) => {
    // a dated window paints its whole range; an open-ended one only marks the day it opens
    // or closes, so a forever-active offer doesn't dot every day of the calendar
    if (row.windowStart !== null && row.windowEnd !== null) {
      return compareIsoDates(row.windowStart, iso) <= 0 && compareIsoDates(iso, row.windowEnd) <= 0;
    }
    if (row.windowEnd !== null) return row.windowEnd === iso;
    if (row.windowStart !== null) return row.windowStart === iso;
    return false;
  });
}

export function watchListOrder(a: OfferRow, b: OfferRow): number {
  const ad = a.recurring.expectedNextWindowDate;
  const bd = b.recurring.expectedNextWindowDate;
  if (ad !== null && bd !== null && ad !== bd) return compareIsoDates(ad, bd);
  if (ad === null && bd !== null) return 1;
  if (ad !== null && bd === null) return -1;
  return a.name.localeCompare(b.name);
}
