import {
  addDays,
  compareIsoDates,
  daysUntilEnd,
  deriveStatus,
  isExpiringSoon,
  isWatchList,
  type Offer,
  type OfferStatus,
  type SnapshotEvent,
} from '@cert-tracker/core';

export const NEW_DAYS = 7;

const WEIGHT_RANK = { high: 0, medium: 1, low: 2 } as const;
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

export interface OfferRow extends Offer {
  derivedStatus: OfferStatus;
  expiringSoon: boolean;
  daysLeft: number | null;
  isNew: boolean;
  watch: boolean;
  group: OfferGroup;
  // sort keys: the table sorts by these, the cells render the enum
  groupRank: number;
  windowEndSort: string;
  weightRank: number;
  whatIsFreeRank: number;
}

export function toRows(offers: readonly Offer[], today: string): OfferRow[] {
  const newSince = addDays(today, -NEW_DAYS);
  return offers.map((offer) => {
    const derivedStatus = deriveStatus(offer, today);
    const expiringSoon = isExpiringSoon(offer, today);
    const group = offerGroup(derivedStatus, expiringSoon);
    return {
      ...offer,
      derivedStatus,
      expiringSoon,
      daysLeft: daysUntilEnd(offer, today),
      isNew: compareIsoDates(offer.addedAt, newSince) >= 0,
      watch: isWatchList(offer, today),
      group,
      groupRank: OFFER_GROUPS.indexOf(group),
      windowEndSort: offer.windowEnd ?? '9999-12-31',
      weightRank: WEIGHT_RANK[offer.credentialWeight],
      whatIsFreeRank: WHAT_IS_FREE_RANK[offer.whatIsFree],
    };
  });
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
