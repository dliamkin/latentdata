import type {
  CredentialWeight,
  Eligibility,
  EventType,
  OfferCategory,
  OfferStatus,
  WhatIsFree,
} from '@cert-tracker/core';

// the colour a marker takes; each maps to one token (see Tags.tsx and app.css)
export type Tone = 'accent' | 'upcoming' | 'grey' | 'deadline' | 'ink' | 'muted';

export interface TagSpec {
  label: string;
  icon: string;
  tone: Tone;
  // bold text: the headline value in its column (a full exam, a strong credential)
  strong?: boolean;
}

// every marker carries text and an icon, so no state is conveyed by colour alone
export const STATUS_TAGS: Record<OfferStatus, TagSpec> = {
  active: { label: 'Active', icon: 'pi pi-check-circle', tone: 'accent' },
  upcoming: { label: 'Upcoming', icon: 'pi pi-play-circle', tone: 'upcoming' },
  expired: { label: 'Expired', icon: 'pi pi-times-circle', tone: 'grey' },
  evergreen: { label: 'Evergreen', icon: 'pi pi-sync', tone: 'muted' },
  unverified: { label: 'Unverified', icon: 'pi pi-question-circle', tone: 'deadline' },
};

export const WHAT_IS_FREE_TAGS: Record<WhatIsFree, TagSpec> = {
  'full-exam': { label: 'Full exam', icon: 'pi pi-star', tone: 'ink', strong: true },
  partial: { label: 'Partial', icon: 'pi pi-percentage', tone: 'ink' },
  'training-and-badge': { label: 'Training + badge', icon: 'pi pi-bookmark', tone: 'ink' },
  'training-only': { label: 'Training only', icon: 'pi pi-book', tone: 'muted' },
};

export const WEIGHT_TAGS: Record<CredentialWeight, TagSpec> = {
  high: { label: 'High', icon: 'pi pi-arrow-up', tone: 'ink', strong: true },
  medium: { label: 'Medium', icon: 'pi pi-minus', tone: 'ink' },
  low: { label: 'Low', icon: 'pi pi-arrow-down', tone: 'muted' },
};

export const ELIGIBILITY_TAGS: Record<Eligibility, TagSpec> = {
  public: { label: 'Public', icon: 'pi pi-globe', tone: 'muted' },
  partner: { label: 'Partner', icon: 'pi pi-briefcase', tone: 'muted' },
  student: { label: 'Student', icon: 'pi pi-graduation-cap', tone: 'muted' },
  customer: { label: 'Customer', icon: 'pi pi-building', tone: 'muted' },
  'event-attendee': { label: 'Event attendee', icon: 'pi pi-ticket', tone: 'muted' },
  'need-based': { label: 'Need-based', icon: 'pi pi-heart', tone: 'muted' },
};

export const CATEGORY_LABELS: Record<OfferCategory, string> = {
  cloud: 'Cloud',
  security: 'Security',
  data: 'Data',
  ai: 'AI',
  marketing: 'Marketing',
  pm: 'Project management',
  dev: 'Development',
  other: 'Other',
};

export const EVENT_LABELS: Record<EventType, { label: string; icon: string; tone: Tone }> = {
  'offer.discovered': { label: 'New offer', icon: 'pi pi-plus-circle', tone: 'accent' },
  'offer.updated': { label: 'Offer updated', icon: 'pi pi-pencil', tone: 'accent' },
  'offer.window_opened': { label: 'Window opened', icon: 'pi pi-play-circle', tone: 'accent' },
  'offer.expiring': { label: 'Expiring soon', icon: 'pi pi-clock', tone: 'deadline' },
  'offer.expired': { label: 'Expired', icon: 'pi pi-times-circle', tone: 'grey' },
  'candidate.needs_review': { label: 'Needs review', icon: 'pi pi-inbox', tone: 'muted' },
  'source.unhealthy': {
    label: 'Source unhealthy',
    icon: 'pi pi-exclamation-triangle',
    tone: 'muted',
  },
  'budget.exceeded': { label: 'Budget exceeded', icon: 'pi pi-wallet', tone: 'muted' },
  'publish.completed': { label: 'Published', icon: 'pi pi-upload', tone: 'muted' },
};

export interface SelectOption<T extends string> {
  label: string;
  value: T;
}

export function toOptions<T extends string>(
  values: readonly T[],
  labelOf: (value: T) => string,
): SelectOption<T>[] {
  return values.map((value) => ({ label: labelOf(value), value }));
}

// the countdown an active offer shows in place of its status once it is ending soon
export function countdownLabel(daysLeft: number): string {
  return daysLeft === 0
    ? 'Ends today'
    : `Ends in ${String(daysLeft)} day${daysLeft === 1 ? '' : 's'}`;
}
