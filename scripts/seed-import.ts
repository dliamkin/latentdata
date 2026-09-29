import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import {
  createDocClient,
  putOfferIfAbsent,
  putSourceIfAbsent,
  setSystemMeta,
} from '@cert-tracker/pipeline/repo';
import {
  OffersSeedSchema,
  SourcesSeedSchema,
  normalizeOffers,
  normalizeSources,
} from '@cert-tracker/pipeline/seed';

import { offersSeedPath, sourcesSeedPath } from './lib/paths.ts';

// npm run seed:import -- --stage dev [--dry-run]
// Credentials come from the usual chain, so run `aws sso login` first and set AWS_PROFILE.
const { values } = parseArgs({
  options: {
    stage: { type: 'string' },
    table: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});

if (values.stage !== 'prod' && values.stage !== 'dev') {
  console.error('usage: npm run seed:import -- --stage <prod|dev> [--table <name>] [--dry-run]');
  process.exit(2);
}

const table = values.table ?? `cert-tracker-${values.stage}`;
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
const now = new Date();

const offers = normalizeOffers(OffersSeedSchema.parse(readJson(offersSeedPath)).offers, now);
const sources = normalizeSources(SourcesSeedSchema.parse(readJson(sourcesSeedPath)));
console.log(`${String(offers.length)} offers and ${String(sources.length)} sources -> ${table}`);

if (values['dry-run']) {
  console.log('dry run: both seed files are valid, nothing was written');
  process.exit(0);
}

const doc = createDocClient();
const tally = { created: 0, exists: 0 };

// one at a time on purpose: the table has five write units and the importer is in no hurry
for (const offer of offers) tally[await putOfferIfAbsent(doc, table, offer)] += 1;
for (const source of sources) tally[await putSourceIfAbsent(doc, table, source)] += 1;

if (tally.created > 0) {
  // without this the publisher would see nothing new and leave the site on the old snapshot
  await setSystemMeta(doc, table, { lastChangeAt: new Date().toISOString() });
}

console.log(`created ${String(tally.created)}, already present ${String(tally.exists)}`);
