import type {
  CredentialWeight,
  Eligibility,
  EventType,
  OfferCategory,
  OfferStatus,
  WhatIsFree,
} from '@cert-tracker/core';

export type TagSeverity = 'success' | 'info' | 'warning' | 'danger' | 'secondary' | 'contrast';

export interface TagSpec {
  label: string;
  icon: string;
  severity: TagSeverity;
}

// every tag carries text and an icon, so no state is conveyed by colour alone
export const STATUS_TAGS: Record<OfferStatus, TagSpec> = {
  active: { label: 'Active', icon: 'pi pi-check-circle', severity: 'success' },
  upcoming: { label: 'Upcoming', icon: 'pi pi-calendar', severity: 'info' },
  expired: { label: 'Expired', icon: 'pi pi-times-circle', severity: 'secondary' },
  evergreen: { label: 'Evergreen', icon: 'pi pi-sync', severity: 'secondary' },
  unverified: { label: 'Unverified', icon: 'pi pi-question-circle', severity: 'warning' },
};

export const WHAT_IS_FREE_TAGS: Record<WhatIsFree, TagSpec> = {
  'full-exam': { label: 'Full exam', icon: 'pi pi-star', severity: 'success' },
  partial: { label: 'Partial', icon: 'pi pi-percentage', severity: 'info' },
  'training-and-badge': {
    label: 'Training + badge',
    icon: 'pi pi-bookmark',
    severity: 'secondary',
  },
  'training-only': { label: 'Training only', icon: 'pi pi-book', severity: 'secondary' },
};

export const WEIGHT_TAGS: Record<CredentialWeight, TagSpec> = {
  high: { label: 'High', icon: 'pi pi-arrow-up', severity: 'contrast' },
  medium: { label: 'Medium', icon: 'pi pi-minus', severity: 'secondary' },
  low: { label: 'Low', icon: 'pi pi-arrow-down', severity: 'secondary' },
};

export const ELIGIBILITY_TAGS: Record<Eligibility, TagSpec> = {
  public: { label: 'Public', icon: 'pi pi-globe', severity: 'secondary' },
  partner: { label: 'Partner', icon: 'pi pi-briefcase', severity: 'secondary' },
  student: { label: 'Student', icon: 'pi pi-graduation-cap', severity: 'secondary' },
  customer: { label: 'Customer', icon: 'pi pi-building', severity: 'secondary' },
  'event-attendee': { label: 'Event attendee', icon: 'pi pi-ticket', severity: 'secondary' },
  'need-based': { label: 'Need-based', icon: 'pi pi-heart', severity: 'secondary' },
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

export const EVENT_LABELS: Record<EventType, { label: string; icon: string }> = {
  'offer.discovered': { label: 'New offer', icon: 'pi pi-plus-circle' },
  'offer.updated': { label: 'Offer updated', icon: 'pi pi-pencil' },
  'offer.window_opened': { label: 'Window opened', icon: 'pi pi-play-circle' },
  'offer.expiring': { label: 'Expiring soon', icon: 'pi pi-clock' },
  'offer.expired': { label: 'Expired', icon: 'pi pi-times-circle' },
  'candidate.needs_review': { label: 'Needs review', icon: 'pi pi-inbox' },
  'source.unhealthy': { label: 'Source unhealthy', icon: 'pi pi-exclamation-triangle' },
  'budget.exceeded': { label: 'Budget exceeded', icon: 'pi pi-wallet' },
  'publish.completed': { label: 'Published', icon: 'pi pi-upload' },
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
