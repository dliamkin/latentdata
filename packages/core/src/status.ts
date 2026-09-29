import { addDays, compareIsoDates, daysBetween } from './dates.ts';
import type { OfferStatus } from './schemas.ts';

export interface StatusInput {
  status: OfferStatus;
  windowStart: string | null;
  windowEnd: string | null;
  recurring: { isRecurring: boolean };
}

export function deriveStatus(offer: StatusInput, today: string): OfferStatus {
  // dates always win; the stored value is only a hint for the undated cases
  if (offer.windowEnd !== null && compareIsoDates(offer.windowEnd, today) < 0) return 'expired';
  if (offer.status === 'unverified') return 'unverified';
  if (offer.windowStart !== null && compareIsoDates(offer.windowStart, today) > 0)
    return 'upcoming';
  if (offer.status === 'upcoming' && offer.windowStart === null) return 'upcoming';
  if (offer.windowStart === null && offer.windowEnd === null) return 'evergreen';
  return 'active';
}

export function isExpiringSoon(offer: StatusInput, today: string, days = 14): boolean {
  if (offer.windowEnd === null) return false;
  if (deriveStatus(offer, today) !== 'active') return false;
  return (
    compareIsoDates(offer.windowEnd, today) >= 0 &&
    compareIsoDates(offer.windowEnd, addDays(today, days)) <= 0
  );
}

export function isWatchList(offer: StatusInput, today: string): boolean {
  const derived = deriveStatus(offer, today);
  if (derived === 'unverified') return true;
  return offer.recurring.isRecurring && (derived === 'expired' || derived === 'upcoming');
}

// null when the offer has no end date or is not counting down
export function daysUntilEnd(offer: StatusInput, today: string): number | null {
  if (offer.windowEnd === null) return null;
  if (deriveStatus(offer, today) !== 'active') return null;
  return daysBetween(today, offer.windowEnd);
}
