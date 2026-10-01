import { fileURLToPath } from 'node:url';

export const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
export const offersSeedPath = `${repoRoot}seed/offers.seed.json`;
export const catalogSeedPath = `${repoRoot}seed/catalog.seed.json`;
export const sourcesSeedPath = `${repoRoot}seed/sources.seed.json`;
export const snapshotPath = `${repoRoot}apps/web/src/data/snapshot.json`;
