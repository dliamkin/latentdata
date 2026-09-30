import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { SourcesSeedSchema, normalizeSources } from '@cert-tracker/pipeline/seed';

import { repoRoot, sourcesSeedPath } from './lib/paths.ts';
import { redactPublicKeys } from './lib/redact.ts';

// npm run fixtures:record -- <sourceId> [<sourceId> ...]
// Hits the network once per source and writes the raw response under fixtures/sources/<id>/
// so the adapter tests never have to.
const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.error('usage: npm run fixtures:record -- <sourceId> [<sourceId> ...]');
  process.exit(2);
}

const sources = normalizeSources(
  SourcesSeedSchema.parse(JSON.parse(readFileSync(sourcesSeedPath, 'utf8'))),
);
const extensions: Record<string, string> = { rss: 'xml', reddit: 'xml', 'github-commits': 'json' };

for (const id of ids) {
  const source = sources.find((s) => s.sourceId === id);
  if (source === undefined) {
    console.error(`no source ${id} in the seed`);
    process.exit(1);
  }
  const url = source.kind === 'github-commits' ? `${source.url}?per_page=30` : source.url;
  const response = await fetch(url, {
    headers: {
      'user-agent': 'cert-tracker/1.0 (+https://github.com/dliamkin/latentdata)',
      accept: source.kind === 'github-commits' ? 'application/vnd.github+json' : '*/*',
    },
    signal: AbortSignal.timeout(20_000),
  });
  const dir = `${repoRoot}fixtures/sources/${id}/`;
  mkdirSync(dir, { recursive: true });
  const body = redactPublicKeys(await response.text());
  const file = `${dir}response.${extensions[source.kind] ?? 'html'}`;
  writeFileSync(file, body);
  writeFileSync(
    `${dir}meta.json`,
    `${JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        url,
        status: response.status,
        contentType: response.headers.get('content-type'),
        bytes: body.length,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`${id}: ${String(response.status)} ${String(body.length)} bytes -> ${file}`);
}
