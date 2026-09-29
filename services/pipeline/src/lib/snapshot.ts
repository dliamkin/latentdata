import {
  SnapshotSchema,
  type Offer,
  type Snapshot,
  type SnapshotEvent,
  type Source,
} from '@cert-tracker/core';

import type { SystemMeta } from './repo/meta.ts';
import { sourceHealth } from './repo/sources.ts';

export const EVENT_TAIL_DAYS = 90;

export interface SnapshotInput {
  offers: readonly Offer[];
  events: readonly SnapshotEvent[];
  sources: readonly Source[];
  meta: Pick<SystemMeta, 'lastPollAt' | 'lastStatusRunAt'>;
  now: Date;
}

const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function eventTailStart(now: Date): string {
  return new Date(now.getTime() - EVENT_TAIL_DAYS * 86_400_000).toISOString();
}

// sorted so two builds from the same data are byte-identical apart from generatedAt; that is
// what lets the publisher skip a commit when nothing changed
export function buildSnapshot(input: SnapshotInput): Snapshot {
  return SnapshotSchema.parse({
    schemaVersion: 1,
    generatedAt: input.now.toISOString(),
    offers: [...input.offers].sort((a, b) => byString(a.id, b.id)),
    events: [...input.events].sort(
      (a, b) => byString(a.occurredAt, b.occurredAt) || byString(a.eventId, b.eventId),
    ),
    meta: {
      lastPollAt: input.meta.lastPollAt,
      lastStatusRunAt: input.meta.lastStatusRunAt,
      sourceHealth: sourceHealth(input.sources),
    },
  });
}

export function serializeSnapshot(snapshot: Snapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

function comparable(snapshot: Snapshot): string {
  // the run timestamps move on every job; a snapshot that differs only there isn't worth a build
  return JSON.stringify({
    ...snapshot,
    generatedAt: '',
    meta: { ...snapshot.meta, lastPollAt: null, lastStatusRunAt: null },
  });
}

export function sameContent(next: Snapshot, publishedText: string): boolean {
  let published: unknown;
  try {
    published = JSON.parse(publishedText);
  } catch {
    return false;
  }
  const parsed = SnapshotSchema.safeParse(published);
  return parsed.success && comparable(parsed.data) === comparable(next);
}
