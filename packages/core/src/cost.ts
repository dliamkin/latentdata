import type { CostToYou, WhatIsFree } from './schemas.ts';

export interface CostInput {
  whatIsFree: WhatIsFree;
  costToYou?: CostToYou | undefined;
}

// the stored answer when there is one. Offers written before the field existed fall back to
// what whatIsFree implies, which is right except where something has to be bought first —
// and that is exactly the case the stored field exists to record.
export function costToYouOf(offer: CostInput): CostToYou {
  if (offer.costToYou !== undefined) return offer.costToYou;
  switch (offer.whatIsFree) {
    case 'partial':
      return 'reduced-price';
    case 'training-only':
      return 'certificate-fee';
    case 'full-exam':
    case 'training-and-badge':
      return 'nothing';
  }
}

export function isTotallyFree(offer: CostInput): boolean {
  return costToYouOf(offer) === 'nothing';
}
