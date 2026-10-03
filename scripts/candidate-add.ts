import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { z } from 'zod';

import {
  CANDIDATE_STAGES,
  CandidateSchema,
  slugForOffer,
  ulid,
  type Candidate,
} from '@cert-tracker/core';
import {
  createDocClient,
  listCandidatesByStage,
  listOffers,
  putCandidateIfAbsent,
} from '@cert-tracker/pipeline/repo';

// npm run candidate:add -- --stage prod --file seed/candidates.review.json [--dry-run]
// Credentials come from the usual chain, so run `aws sso login` first and set AWS_PROFILE.
// Puts hand-found offers into the review queue rather than straight onto the site, so they get
// the same second look in the Review tab as anything the pipeline finds. Safe to re-run: an
// entry already queued, decided or published is skipped.
const { values } = parseArgs({
  options: {
    stage: { type: 'string' },
    file: { type: 'string' },
    table: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});

if ((values.stage !== 'prod' && values.stage !== 'dev') || values.file === undefined) {
  console.error(
    'usage: npm run candidate:add -- --stage <prod|dev> --file <candidates.json> [--dry-run]',
  );
  process.exit(2);
}

const table = values.table ?? `cert-tracker-${values.stage}`;
const dryRun = values['dry-run'];
const now = new Date();

// the file carries what a person knows; everything the pipeline would have stamped is filled in
// here, and `why` stands where the model's rationale would be
const entries = z
  .array(z.looseObject({ why: z.string().min(1).max(500) }))
  .parse(JSON.parse(readFileSync(values.file, 'utf8')));

const candidates: Candidate[] = entries.map(({ why, ...fields }, index) =>
  CandidateSchema.parse({
    matchesExistingId: null,
    ...fields,
    // distinct milliseconds keep the queue in file order
    candidateId: ulid(now.getTime() + index),
    stage: 'verified',
    signalIds: [],
    promptVersion: 'manual',
    model: 'manual',
    llmRationale: why,
    createdAt: new Date(now.getTime() + index).toISOString(),
  }),
);

const doc = createDocClient();
const slug = (item: { vendor: string; name: string; windowEnd: string | null }): string =>
  slugForOffer(item.vendor, item.name, item.windowEnd);
const published = new Set((await listOffers(doc, table)).map((offer) => offer.id));
const seen = new Set<string>();
for (const stage of CANDIDATE_STAGES) {
  for (const existing of await listCandidatesByStage(doc, table, stage)) seen.add(slug(existing));
}

let added = 0;
for (const candidate of candidates) {
  const id = slug(candidate);
  const label = `${candidate.vendor} — ${candidate.name}`;
  if (published.has(id)) {
    console.log(`skip (already an offer)     ${label}`);
  } else if (seen.has(id)) {
    console.log(`skip (already a candidate)  ${label}`);
  } else {
    if (!dryRun) await putCandidateIfAbsent(doc, table, candidate);
    seen.add(id);
    added += 1;
    console.log(`${dryRun ? 'would queue' : 'queued     '}                 ${label}`);
  }
}
console.log(
  `${String(added)} of ${String(candidates.length)} ${dryRun ? 'would be queued' : 'queued'} in ${table}`,
);
