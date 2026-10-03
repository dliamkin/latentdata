import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import {
  createDocClient,
  deleteCatalogEntry,
  listCatalog,
  listOffers,
  listSources,
  putCatalogEntry,
  putOfferIfAbsent,
  putSourceIfAbsent,
  setOfferCostToYou,
  setOfferTaxonomy,
  setSourceKeywords,
  setSystemMeta,
} from '@cert-tracker/pipeline/repo';
import {
  CatalogSeedSchema,
  OffersSeedSchema,
  SourcesSeedSchema,
  normalizeOffers,
  normalizeSources,
  planCatalogSync,
  planCostBackfill,
  planKeywordTopUp,
  planTaxonomyBackfill,
} from '@cert-tracker/pipeline/seed';

import { catalogSeedPath, offersSeedPath, sourcesSeedPath } from './lib/paths.ts';

// npm run seed:import -- --stage dev [--dry-run]
// Credentials come from the usual chain, so run `aws sso login` first and set AWS_PROFILE.
// Safe to re-run: offers and sources are never overwritten, only the catalog is (the seed file
// is where it is edited), plus two additive repairs for rows imported before this taxonomy.
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
const catalog = CatalogSeedSchema.parse(readJson(catalogSeedPath)).entries;
console.log(
  `${String(offers.length)} offers, ${String(sources.length)} sources and ${String(catalog.length)} catalog entries -> ${table}`,
);

if (values['dry-run']) {
  console.log('dry run: the three seed files are valid, nothing was written');
  process.exit(0);
}

const doc = createDocClient();
const tally = { created: 0, exists: 0 };

// one at a time on purpose: the table has five write units and the importer is in no hurry
for (const offer of offers) tally[await putOfferIfAbsent(doc, table, offer)] += 1;
for (const source of sources) tally[await putSourceIfAbsent(doc, table, source)] += 1;

const backfill = planTaxonomyBackfill(await listOffers(doc, table), offers);
for (const entry of backfill) {
  await setOfferTaxonomy(doc, table, entry.id, entry, now);
}

const costs = planCostBackfill(await listOffers(doc, table), offers);
for (const entry of costs) await setOfferCostToYou(doc, table, entry.id, entry.costToYou, now);

const topUp = planKeywordTopUp(await listSources(doc, table), sources);
for (const entry of topUp) await setSourceKeywords(doc, table, entry.sourceId, entry);

const sync = planCatalogSync(await listCatalog(doc, table), catalog);
for (const entry of sync.put) await putCatalogEntry(doc, table, entry);
for (const id of sync.remove) await deleteCatalogEntry(doc, table, id);

if (
  tally.created > 0 ||
  backfill.length > 0 ||
  costs.length > 0 ||
  sync.put.length > 0 ||
  sync.remove.length > 0
) {
  // without this the publisher would see nothing new and leave the site on the old snapshot
  await setSystemMeta(doc, table, { lastChangeAt: new Date().toISOString() });
}

console.log(
  `offers and sources: created ${String(tally.created)}, present ${String(tally.exists)}`,
);
console.log(
  `repairs: ${String(backfill.length)} offers classified, ${String(costs.length)} given a cost, ${String(topUp.length)} sources re-keyworded`,
);
console.log(
  `catalog: ${String(sync.put.length)} written, ${String(sync.remove.length)} removed, ${String(catalog.length - sync.put.length)} unchanged`,
);
