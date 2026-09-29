import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { generateJsonSchemas } from '@cert-tracker/core';

const outDir = fileURLToPath(new URL('../packages/core/schema/', import.meta.url));
mkdirSync(outDir, { recursive: true });

for (const [name, schema] of Object.entries(generateJsonSchemas())) {
  const file = `${outDir}${name}.schema.json`;
  writeFileSync(file, `${JSON.stringify(schema, null, 2)}\n`);
  console.log(`wrote ${file}`);
}
