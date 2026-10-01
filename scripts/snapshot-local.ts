import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { z } from 'zod';

import {
  CatalogEntrySchema,
  OfferSchema,
  SnapshotSchema,
  SourceSchema,
  ulid,
  type Snapshot,
  type SnapshotEvent,
} from '@cert-tracker/core';

import { catalogSeedPath, offersSeedPath, snapshotPath, sourcesSeedPath } from './lib/paths.ts';

// stands in for the publish Lambda until M2: same schema, same file, no DynamoDB
const OffersSeed = z.object({ offers: z.array(OfferSchema) });
const CatalogSeed = z.object({ entries: z.array(CatalogEntrySchema) });
const SourcesSeed = z.object({
  sources: z.array(SourceSchema.pick({ sourceId: true, enabled: true })),
});

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

const { offers } = OffersSeed.parse(readJson(offersSeedPath));
const { sources } = SourcesSeed.parse(readJson(sourcesSeedPath));
const { entries: catalog } = CatalogSeed.parse(readJson(catalogSeedPath));

// seeded offers were discovered on their addedAt day; ids are derived from the offer id so
// regenerating the snapshot doesn't churn the file
const events: SnapshotEvent[] = offers.map((offer) => {
  const occurredAt = `${offer.addedAt}T00:00:00.000Z`;
  const bytes = createHash('sha256').update(offer.id).digest().subarray(0, 10);
  return {
    eventId: ulid(Date.parse(occurredAt), new Uint8Array(bytes)),
    type: 'offer.discovered',
    occurredAt,
    offerId: offer.id,
    payload: { name: offer.name, vendor: offer.vendor, status: offer.status },
  };
});
events.sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : a.occurredAt > b.occurredAt ? 1 : 0));

const snapshot: Snapshot = SnapshotSchema.parse({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  offers,
  catalog,
  events,
  meta: {
    lastPollAt: null,
    lastStatusRunAt: null,
    sourceHealth: { total: sources.filter((s) => s.enabled).length, unhealthy: 0 },
  },
});

mkdirSync(dirname(snapshotPath), { recursive: true });
writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(
  `wrote ${snapshotPath}: ${String(snapshot.offers.length)} offers, ${String(snapshot.catalog.length)} catalog entries, ${String(snapshot.events.length)} events`,
);
