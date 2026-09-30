import { parseArgs } from 'node:util';

import { GetCommand } from '@aws-sdk/lib-dynamodb';

import { SourceSchema } from '@cert-tracker/core';
import { createDocClient, itemToSource, putSource, sourceKey } from '@cert-tracker/pipeline/repo';

// npm run source:set -- --stage prod --id rss-x [--url ...] [--enabled true|false] [--notes "..."]
// The table is the truth after the seed import, so a corrected feed URL or a disabled source
// has to be written here, not just in the seed file. Resets the failure count so the next poll
// gives the new URL a clean start.
const { values } = parseArgs({
  options: {
    stage: { type: 'string' },
    id: { type: 'string' },
    url: { type: 'string' },
    enabled: { type: 'string' },
    notes: { type: 'string' },
    table: { type: 'string' },
  },
});

if ((values.stage !== 'prod' && values.stage !== 'dev') || values.id === undefined) {
  console.error(
    'usage: npm run source:set -- --stage <prod|dev> --id <sourceId> [--url <url>] [--enabled true|false] [--notes <text>]',
  );
  process.exit(2);
}

const table = values.table ?? `cert-tracker-${values.stage}`;
const doc = createDocClient();
const current = await doc.send(new GetCommand({ TableName: table, Key: sourceKey(values.id) }));
if (current.Item === undefined) {
  console.error(`no source ${values.id} in ${table}`);
  process.exit(1);
}
const source = itemToSource(current.Item);
const next = SourceSchema.parse({
  ...source,
  ...(values.url === undefined ? {} : { url: values.url }),
  ...(values.enabled === undefined ? {} : { enabled: values.enabled === 'true' }),
  ...(values.notes === undefined ? {} : { notes: values.notes }),
  state: { consecutiveFailures: 0 },
});
await putSource(doc, table, next);
console.log(`${values.id}: url=${next.url} enabled=${String(next.enabled)}`);
