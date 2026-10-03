import { z } from 'zod';

import { compareIsoDates, isIsoDate } from './dates.ts';
import { isUlid } from './ids.ts';

export const IsoDateSchema = z.string().refine(isIsoDate, 'expected a YYYY-MM-DD calendar date');
export const IsoDateTimeSchema = z.iso.datetime();
export const UlidSchema = z.string().refine(isUlid, 'expected a ULID');
export const SlugSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'expected a kebab-case id');

export const OFFER_CATEGORIES = [
  'cloud',
  'security',
  'data',
  'ai',
  'marketing',
  'pm',
  'dev',
  'infrastructure',
  'other',
] as const;
// who a credential is for: people who write code, people who run systems; an offer can be
// both, or neither (marketing, general business)
export const TRACKS = ['software', 'it'] as const;
// a closed list so filters and the extraction schema agree on spelling; grouped for the UI
export const TECHNOLOGY_GROUPS = {
  language: [
    'javascript',
    'typescript',
    'python',
    'java',
    'csharp',
    'cpp',
    'go',
    'rust',
    'php',
    'ruby',
    'kotlin',
    'swift',
    'sql',
    'r',
    'html-css',
  ],
  framework: ['dotnet', 'react', 'angular', 'vue', 'nodejs', 'spring', 'android', 'ios'],
  platform: [
    'aws',
    'azure',
    'gcp',
    'oci',
    'kubernetes',
    'docker',
    'terraform',
    'linux',
    'git',
    'github',
    'salesforce',
    'databricks',
    'snowflake',
    'mongodb',
    'power-platform',
  ],
} as const;
export const TECHNOLOGIES = [
  ...TECHNOLOGY_GROUPS.language,
  ...TECHNOLOGY_GROUPS.framework,
  ...TECHNOLOGY_GROUPS.platform,
] as const;
export const WHAT_IS_FREE = [
  'full-exam',
  'partial',
  'training-and-badge',
  'training-only',
] as const;
// what the person still pays, the part whatIsFree cannot say: a free exam for conference
// attendees is not free when the ticket is not
//   nothing         no money changes hands at any point
//   purchase-first  free or discounted only after buying something else: an event ticket, a
//                   subscription, another exam
//   reduced-price   a discount; the rest of the fee is still due
//   certificate-fee the training is free and the certificate is sold
export const COSTS_TO_YOU = [
  'nothing',
  'purchase-first',
  'reduced-price',
  'certificate-fee',
] as const;
export const CREDENTIAL_WEIGHTS = ['high', 'medium', 'low'] as const;
export const ELIGIBILITIES = [
  'public',
  'partner',
  'student',
  'customer',
  'event-attendee',
  'need-based',
] as const;
export const OFFER_STATUSES = ['active', 'upcoming', 'expired', 'evergreen', 'unverified'] as const;
export const EVENT_TYPES = [
  'offer.discovered',
  'offer.updated',
  'offer.window_opened',
  'offer.expiring',
  'offer.expired',
  'candidate.needs_review',
  'source.unhealthy',
  'budget.exceeded',
  'publish.completed',
] as const;

export const OfferCategorySchema = z.enum(OFFER_CATEGORIES);
export const TrackSchema = z.enum(TRACKS);
export const TechnologySchema = z.enum(TECHNOLOGIES);
export const WhatIsFreeSchema = z.enum(WHAT_IS_FREE);
export const CostToYouSchema = z.enum(COSTS_TO_YOU);
export const CredentialWeightSchema = z.enum(CREDENTIAL_WEIGHTS);
export const EligibilitySchema = z.enum(ELIGIBILITIES);
export const OfferStatusSchema = z.enum(OFFER_STATUSES);
export const EventTypeSchema = z.enum(EVENT_TYPES);

export type OfferCategory = z.infer<typeof OfferCategorySchema>;
export type Track = z.infer<typeof TrackSchema>;
export type Technology = z.infer<typeof TechnologySchema>;
export type TechnologyGroup = keyof typeof TECHNOLOGY_GROUPS;
export type WhatIsFree = z.infer<typeof WhatIsFreeSchema>;
export type CostToYou = z.infer<typeof CostToYouSchema>;
export type CredentialWeight = z.infer<typeof CredentialWeightSchema>;
export type Eligibility = z.infer<typeof EligibilitySchema>;
export type OfferStatus = z.infer<typeof OfferStatusSchema>;
export type EventType = z.infer<typeof EventTypeSchema>;

export const RecurringSchema = z.object({
  isRecurring: z.boolean(),
  cadence: z.string().nullable(),
  expectedNextWindow: z.string().nullable(),
  expectedNextWindowDate: IsoDateSchema.nullable(),
});

const offerFields = {
  name: z.string().min(1),
  vendor: z.string().min(1),
  category: OfferCategorySchema,
  // defaulted so items written before the taxonomy existed still parse
  tracks: z.array(TrackSchema).default([]),
  technologies: z.array(TechnologySchema).default([]),
  certifications: z.array(z.string().min(1)).min(1),
  examCode: z.string().nullable(),
  whatIsFree: WhatIsFreeSchema,
  cost: z.string().nullable(),
  // optional so items written before the field existed still parse; costToYouOf() fills the gap
  costToYou: CostToYouSchema.optional(),
  credentialWeight: CredentialWeightSchema,
  eligibility: z.array(EligibilitySchema).min(1),
  regions: z.string().min(1),
  windowStart: IsoDateSchema.nullable(),
  windowEnd: IsoDateSchema.nullable(),
  status: OfferStatusSchema,
  recurring: RecurringSchema,
  requirements: z.string().min(1),
  url: z.url(),
  sourceUrl: z.url(),
  lastVerified: IsoDateSchema,
  verificationNote: z.string(),
  notes: z.string(),
};

interface OfferInvariantInput {
  whatIsFree: WhatIsFree;
  cost: string | null;
  costToYou?: CostToYou | undefined;
  windowStart: string | null;
  windowEnd: string | null;
}

// shared by Offer and Candidate so the two can never disagree about what a valid offer is
function offerInvariants(value: OfferInvariantInput, ctx: z.RefinementCtx): void {
  const partial = value.whatIsFree === 'partial';
  if (partial && value.cost === null) {
    ctx.addIssue({ code: 'custom', path: ['cost'], message: 'partial offers must state the cost' });
  }
  if (!partial && value.cost !== null) {
    ctx.addIssue({ code: 'custom', path: ['cost'], message: 'only partial offers carry a cost' });
  }
  // the two fields answer different questions but must not contradict each other
  const paidKind = partial || value.whatIsFree === 'training-only';
  if (
    (value.costToYou === 'nothing' && paidKind) ||
    (value.costToYou === 'reduced-price' && !partial) ||
    (value.costToYou === 'certificate-fee' && value.whatIsFree !== 'training-only')
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['costToYou'],
      message: `costToYou '${value.costToYou}' contradicts whatIsFree '${value.whatIsFree}'`,
    });
  }
  if (
    value.windowStart !== null &&
    value.windowEnd !== null &&
    compareIsoDates(value.windowStart, value.windowEnd) > 0
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['windowEnd'],
      message: 'windowEnd is before windowStart',
    });
  }
}

export const OfferSchema = z
  .object({
    id: SlugSchema,
    ...offerFields,
    addedBy: z.enum(['manual', 'scan']),
    addedAt: IsoDateSchema,
    updatedAt: IsoDateTimeSchema.optional(),
  })
  .superRefine(offerInvariants);

export type Offer = z.infer<typeof OfferSchema>;

export const CANDIDATE_STAGES = ['triaged', 'verified', 'approved', 'dismissed', 'merged'] as const;
export const CONFIDENCES = ['high', 'medium', 'low'] as const;

export const CandidateSchema = z
  .object({
    candidateId: UlidSchema,
    ...offerFields,
    stage: z.enum(CANDIDATE_STAGES),
    confidence: z.enum(CONFIDENCES),
    matchesExistingId: SlugSchema.nullable(),
    signalIds: z.array(UlidSchema),
    promptVersion: z.string().min(1),
    model: z.string().min(1),
    llmRationale: z.string().max(500),
    createdAt: IsoDateTimeSchema,
    decidedAt: IsoDateTimeSchema.optional(),
    decidedBy: z.enum(['admin', 'auto']).optional(),
  })
  .superRefine(offerInvariants);

export type Candidate = z.infer<typeof CandidateSchema>;

export const SIGNAL_STATES = [
  'new',
  'queued',
  'triaged',
  'verified',
  'verify-failed',
  'deferred',
] as const;

export const SignalSchema = z.object({
  signalId: UlidSchema,
  sourceId: z.string().min(1),
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  url: z.url(),
  title: z.string(),
  excerpt: z.string().max(2000),
  publishedAt: IsoDateTimeSchema.nullable(),
  seenAt: IsoDateTimeSchema,
  state: z.enum(SIGNAL_STATES),
  triage: z
    .object({
      verdict: z.enum(['relevant', 'irrelevant']),
      confidence: z.number().min(0).max(1),
      reason: z.string(),
      promptVersion: z.string(),
      model: z.string(),
    })
    .optional(),
  // set when the budget guard parked the signal; poll re-queues it once the day rolls over
  deferredAt: IsoDateTimeSchema.optional(),
  deferredStage: z.enum(['triage', 'verify']).optional(),
});

export type Signal = z.infer<typeof SignalSchema>;

export const SOURCE_KINDS = ['rss', 'reddit', 'github-commits', 'page-diff', 'json-api'] as const;

export const SourceStateSchema = z.object({
  etag: z.string().optional(),
  lastModified: z.string().optional(),
  lastPolledAt: IsoDateTimeSchema.optional(),
  lastSuccessAt: IsoDateTimeSchema.optional(),
  consecutiveFailures: z.number().int().min(0),
  lastError: z.string().optional(),
  contentHash: z.string().optional(),
  // page-diff keeps the last extracted text so the next change can be shown as a diff
  pageText: z.string().max(8000).optional(),
  robotsAllowed: z.boolean().optional(),
  robotsCheckedAt: IsoDateTimeSchema.optional(),
  // set from Retry-After on a 429; poll skips the source until then
  cooldownUntil: IsoDateTimeSchema.optional(),
});

export const SourceSchema = z.object({
  sourceId: z.string().min(1),
  kind: z.enum(SOURCE_KINDS),
  vendor: z.string().nullable(),
  url: z.url(),
  pollIntervalMinutes: z.number().int().positive(),
  enabled: z.boolean(),
  tags: z.array(z.string()),
  keywordsInclude: z.array(z.string()),
  keywordsExclude: z.array(z.string()),
  notes: z.string().optional(),
  state: SourceStateSchema,
});

export type Source = z.infer<typeof SourceSchema>;

export const AUDIENCES = ['public', 'admin'] as const;

export const EventSchema = z.object({
  eventId: UlidSchema,
  type: EventTypeSchema,
  occurredAt: IsoDateTimeSchema,
  idempotencyKey: z.string().min(1),
  offerId: SlugSchema.optional(),
  candidateId: UlidSchema.optional(),
  payload: z.record(z.string(), z.unknown()),
  audience: z.enum(AUDIENCES),
});

export type Event = z.infer<typeof EventSchema>;

export const NtfyTargetSchema = z.object({ server: z.url(), topic: z.string().min(1) });
export const WebPushTargetSchema = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});
export const EmailTargetSchema = z.object({ address: z.email() });

export const SUBSCRIBER_STATUSES = ['pending', 'active', 'unsubscribed', 'bounced'] as const;

export const SubscriberPrefsSchema = z.object({
  events: z.array(EventTypeSchema),
  minWeight: CredentialWeightSchema,
  eligibility: z.array(EligibilitySchema),
  categories: z.union([z.array(OfferCategorySchema), z.literal('all')]),
  delivery: z.enum(['immediate', 'daily-digest']),
});

const subscriberFields = {
  subId: UlidSchema,
  status: z.enum(SUBSCRIBER_STATUSES),
  prefs: SubscriberPrefsSchema,
  role: z.enum(['owner', 'public']),
  unsubscribeTokenHash: z.string().min(1),
  createdAt: IsoDateTimeSchema,
  verifiedAt: IsoDateTimeSchema.optional(),
};

// the target shape depends on the channel, so the union is the schema, not a refinement
export const SubscriberSchema = z.discriminatedUnion('channel', [
  z.object({ ...subscriberFields, channel: z.literal('ntfy'), target: NtfyTargetSchema }),
  z.object({ ...subscriberFields, channel: z.literal('webpush'), target: WebPushTargetSchema }),
  z.object({ ...subscriberFields, channel: z.literal('email'), target: EmailTargetSchema }),
]);

export type Subscriber = z.infer<typeof SubscriberSchema>;
export type SubscriberChannel = Subscriber['channel'];

export const NotificationSchema = z.object({
  notifId: z.string().min(1),
  eventId: UlidSchema,
  subId: UlidSchema,
  channel: z.enum(['ntfy', 'webpush', 'email']),
  status: z.enum(['sent', 'failed', 'skipped']),
  attempt: z.number().int().min(1),
  sentAt: IsoDateTimeSchema.optional(),
  error: z.string().optional(),
});

export type Notification = z.infer<typeof NotificationSchema>;

export const CATALOG_KINDS = ['exam', 'course'] as const;

// a well-known credential, listed whether or not an offer covers it right now
export const CatalogEntrySchema = z.object({
  id: SlugSchema,
  name: z.string().min(1),
  vendor: z.string().min(1),
  kind: z.enum(CATALOG_KINDS),
  category: OfferCategorySchema,
  tracks: z.array(TrackSchema),
  technologies: z.array(TechnologySchema),
  examCode: z.string().nullable(),
  // standard US list price; null when the vendor doesn't publish one figure
  listPriceUsd: z.number().min(0).nullable(),
  priceNote: z.string(),
  // other names offers use for it; this is what ties an offer to the entry
  aliases: z.array(z.string().min(1)),
  // display order inside its category, 1 first
  rank: z.number().int().min(1),
  url: z.url(),
  lastVerified: IsoDateSchema,
  notes: z.string(),
});

export type CatalogEntry = z.infer<typeof CatalogEntrySchema>;
export type CatalogKind = CatalogEntry['kind'];

export const SnapshotEventSchema = EventSchema.pick({
  eventId: true,
  type: true,
  occurredAt: true,
  offerId: true,
  payload: true,
});

export type SnapshotEvent = z.infer<typeof SnapshotEventSchema>;

export const SnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: IsoDateTimeSchema,
  offers: z.array(OfferSchema),
  // absent from snapshots published before the catalog existed
  catalog: z.array(CatalogEntrySchema).default([]),
  events: z.array(SnapshotEventSchema),
  meta: z.object({
    lastPollAt: IsoDateTimeSchema.nullable(),
    lastStatusRunAt: IsoDateTimeSchema.nullable(),
    sourceHealth: z.object({ total: z.number().int().min(0), unhealthy: z.number().int().min(0) }),
  }),
});

export type Snapshot = z.infer<typeof SnapshotSchema>;
