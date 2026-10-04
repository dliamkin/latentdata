import type {
  CatalogKind,
  CostToYou,
  CredentialWeight,
  Eligibility,
  EventType,
  OfferCategory,
  OfferStatus,
  Technology,
  TechnologyGroup,
  Track,
  WhatIsFree,
} from '@cert-tracker/core';

import type { Coverage } from '../data/catalog.ts';
import type { ClaimRole, PriceRange } from '../data/offers.ts';
import { priceRangeLabel } from './format.ts';

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

// said the way a visitor would: what they walk away with, not how the vendor files it
export const WHAT_IS_FREE_TAGS: Record<WhatIsFree, TagSpec> = {
  'full-exam': { label: 'Free exam', icon: 'pi pi-star-fill', tone: 'ink', strong: true },
  partial: { label: 'Exam discount', icon: 'pi pi-percentage', tone: 'ink' },
  'training-and-badge': { label: 'Course + badge', icon: 'pi pi-bookmark-fill', tone: 'ink' },
  'training-only': { label: 'Course only', icon: 'pi pi-book', tone: 'muted' },
};

export interface ExplainedTag extends TagSpec {
  // one plain sentence, shown as the hover text and in the key under the table
  explain: string;
}

// the question every visitor has first: will this cost me anything?
export const COST_TAGS: Record<CostToYou, ExplainedTag> = {
  nothing: {
    label: '100% free',
    icon: 'pi pi-check-circle',
    tone: 'accent',
    strong: true,
    explain: 'Nothing to pay at any point.',
  },
  'purchase-first': {
    label: 'Purchase needed',
    icon: 'pi pi-shopping-cart',
    tone: 'deadline',
    explain:
      'Only after buying something else first: an event ticket, a subscription or another exam.',
  },
  'reduced-price': {
    label: 'You pay part',
    icon: 'pi pi-wallet',
    tone: 'deadline',
    explain: 'A discount. The rest of the exam fee is still yours to pay.',
  },
  'certificate-fee': {
    label: 'Paid certificate',
    icon: 'pi pi-credit-card',
    tone: 'grey',
    explain: 'The course is free. The certificate or exam is sold separately.',
  },
};

// how much the credential counts with an employer; three bars, three words
export const WEIGHT_TAGS: Record<CredentialWeight, ExplainedTag> = {
  high: {
    label: 'High',
    icon: 'pi pi-arrow-up',
    tone: 'ink',
    strong: true,
    explain: 'Exams employers name in job ads.',
  },
  medium: {
    label: 'Medium',
    icon: 'pi pi-minus',
    tone: 'ink',
    explain: 'Entry-level certifications from a known vendor.',
  },
  low: {
    label: 'Low',
    icon: 'pi pi-arrow-down',
    tone: 'muted',
    explain: 'Course certificates and badges.',
  },
};

export const ELIGIBILITY_TAGS: Record<Eligibility, TagSpec> = {
  public: { label: 'Public', icon: 'pi pi-globe', tone: 'muted' },
  partner: { label: 'Partner', icon: 'pi pi-briefcase', tone: 'muted' },
  student: { label: 'Student', icon: 'pi pi-graduation-cap', tone: 'muted' },
  customer: { label: 'Customer', icon: 'pi pi-building', tone: 'muted' },
  'event-attendee': { label: 'Event attendee', icon: 'pi pi-ticket', tone: 'muted' },
  'need-based': { label: 'Need-based', icon: 'pi pi-heart', tone: 'muted' },
};

// the same groups said in the first person, for the "I am" buttons that hide what a visitor
// cannot claim; `explain` is the hover text
export const CLAIM_LABELS: Record<ClaimRole, { label: string; explain: string }> = {
  student: {
    label: 'A student',
    explain: 'Enrolled at a school, college or university.',
  },
  partner: {
    label: 'A partner',
    explain: 'You work at a company that is a registered partner of the vendor.',
  },
  customer: {
    label: 'A customer',
    explain: 'You or your employer already pay the vendor for a product or subscription.',
  },
  'event-attendee': {
    label: 'Going to an event',
    explain: "You are registered for the vendor's conference or event.",
  },
  'need-based': {
    label: 'Eligible for aid',
    explain: 'Financial need, or a military, veteran or similar support programme.',
  },
};

// what the list price means beside each kind of offer: the fee a free exam or a discount is
// measured against, or what the certificate costs when only the course is free
export function listPriceLabel(whatIsFree: WhatIsFree, price: PriceRange): string {
  return `${whatIsFree === 'training-only' ? 'Certificate' : 'Normally'} ${priceRangeLabel(price)}`;
}

export const TRACK_TAGS: Record<Track, TagSpec> = {
  software: { label: 'Software', icon: 'pi pi-code', tone: 'muted' },
  it: { label: 'IT & ops', icon: 'pi pi-server', tone: 'muted' },
};

export const CATALOG_KIND_LABELS: Record<CatalogKind, string> = {
  exam: 'Exam',
  course: 'Course',
};

// what the catalog says about a credential today; "free now" is the whole point of the site
export const COVERAGE_TAGS: Record<Coverage, TagSpec> = {
  'free-now': { label: 'Free now', icon: 'pi pi-star', tone: 'accent', strong: true },
  'reduced-now': { label: 'Discounted now', icon: 'pi pi-percentage', tone: 'accent' },
  opening: { label: 'Offer opening', icon: 'pi pi-play-circle', tone: 'upcoming' },
  'needs-check': { label: 'Unconfirmed offer', icon: 'pi pi-question-circle', tone: 'deadline' },
  none: { label: 'No offer now', icon: 'pi pi-minus', tone: 'grey' },
};

export const TECHNOLOGY_GROUP_LABELS: Record<TechnologyGroup, string> = {
  language: 'Languages',
  framework: 'Frameworks',
  platform: 'Platforms & tools',
};

export const TECHNOLOGY_LABELS: Record<Technology, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  java: 'Java',
  csharp: 'C#',
  cpp: 'C++',
  go: 'Go',
  rust: 'Rust',
  php: 'PHP',
  ruby: 'Ruby',
  kotlin: 'Kotlin',
  swift: 'Swift',
  sql: 'SQL',
  r: 'R',
  'html-css': 'HTML & CSS',
  dotnet: '.NET',
  react: 'React',
  angular: 'Angular',
  vue: 'Vue',
  nodejs: 'Node.js',
  spring: 'Spring',
  android: 'Android',
  ios: 'iOS',
  aws: 'AWS',
  azure: 'Azure',
  gcp: 'Google Cloud',
  oci: 'Oracle Cloud',
  kubernetes: 'Kubernetes',
  docker: 'Docker',
  terraform: 'Terraform',
  linux: 'Linux',
  git: 'Git',
  github: 'GitHub',
  salesforce: 'Salesforce',
  databricks: 'Databricks',
  snowflake: 'Snowflake',
  mongodb: 'MongoDB',
  'power-platform': 'Power Platform',
};

export const CATEGORY_LABELS: Record<OfferCategory, string> = {
  cloud: 'Cloud',
  security: 'Security',
  data: 'Data',
  ai: 'AI',
  marketing: 'Marketing',
  pm: 'Project management',
  dev: 'Development',
  infrastructure: 'Networking & systems',
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
