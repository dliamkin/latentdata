import {
  OfferSchema,
  slugForOffer,
  uniqueSlug,
  utcIsoDate,
  type Candidate,
  type Offer,
  type OfferStatus,
} from '@cert-tracker/core';

export interface Promotion {
  status: OfferStatus;
  verificationNote: string;
}

// the one place a candidate turns into an offer, so the auto-accept path and an admin's approval
// cannot disagree about the slug, the dates or which fields carry over
export function promoteCandidate(
  candidate: Candidate,
  existing: readonly Offer[],
  promotion: Promotion,
  now: Date,
): Offer {
  const taken = new Set(existing.map((offer) => offer.id));
  const today = utcIsoDate(now);
  return OfferSchema.parse({
    id: uniqueSlug(slugForOffer(candidate.vendor, candidate.name, candidate.windowEnd), (s) =>
      taken.has(s),
    ),
    name: candidate.name,
    vendor: candidate.vendor,
    category: candidate.category,
    tracks: candidate.tracks,
    technologies: candidate.technologies,
    certifications: candidate.certifications,
    examCode: candidate.examCode,
    whatIsFree: candidate.whatIsFree,
    cost: candidate.cost,
    costToYou: candidate.costToYou,
    credentialWeight: candidate.credentialWeight,
    eligibility: candidate.eligibility,
    regions: candidate.regions,
    windowStart: candidate.windowStart,
    windowEnd: candidate.windowEnd,
    status: promotion.status,
    recurring: candidate.recurring,
    requirements: candidate.requirements,
    url: candidate.url,
    sourceUrl: candidate.sourceUrl,
    lastVerified: today,
    verificationNote: promotion.verificationNote,
    notes: candidate.notes,
    addedBy: 'scan',
    addedAt: today,
    updatedAt: now.toISOString(),
  });
}
