import { readFileSync } from 'node:fs';

import { SnapshotSchema } from '@cert-tracker/core';

import { snapshotPath } from './lib/paths.ts';

// runs as the web app's prebuild so a bad snapshot fails before Vite starts
const result = SnapshotSchema.safeParse(JSON.parse(readFileSync(snapshotPath, 'utf8')));

if (!result.success) {
  console.error(`snapshot.json is invalid:\n${result.error.message}`);
  process.exit(1);
}

console.log(
  `snapshot.json ok: ${String(result.data.offers.length)} offers, generated ${result.data.generatedAt}`,
);
