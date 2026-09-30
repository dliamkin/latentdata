import { z } from 'zod';

// what travels on the two internal queues; the signal item in the table stays the record

export const TriageMessageSchema = z.object({
  signalId: z.string(),
  sourceId: z.string(),
  fingerprint: z.string(),
  seenAt: z.iso.datetime(),
  url: z.url(),
  title: z.string(),
  excerpt: z.string().max(2000),
});

export type TriageMessage = z.infer<typeof TriageMessageSchema>;

export const VerifyMessageSchema = TriageMessageSchema.pick({
  signalId: true,
  sourceId: true,
  fingerprint: true,
  seenAt: true,
  url: true,
  title: true,
});

export type VerifyMessage = z.infer<typeof VerifyMessageSchema>;
