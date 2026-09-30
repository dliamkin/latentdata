import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { z } from 'zod';

import { createLlmClient } from '@cert-tracker/pipeline/llm';

import { repoRoot } from './lib/paths.ts';

// npm run eval:triage -- [--model claude-haiku-4-5] [--input-per-mtok 1 --output-per-mtok 5]
// Runs the real triage model over fixtures/eval/triage.jsonl and prints precision, recall and
// cost. Manual, never in CI: it spends money. Needs ANTHROPIC_API_KEY in the environment.
const { values } = parseArgs({
  options: {
    model: { type: 'string', default: 'claude-haiku-4-5' },
    'input-per-mtok': { type: 'string', default: '1' },
    'output-per-mtok': { type: 'string', default: '5' },
    file: { type: 'string', default: `${repoRoot}fixtures/eval/triage.jsonl` },
  },
});

const apiKey = process.env.ANTHROPIC_API_KEY;
if (apiKey === undefined || apiKey === '') {
  console.error('set ANTHROPIC_API_KEY first');
  process.exit(2);
}

const Row = z.object({
  title: z.string(),
  excerpt: z.string(),
  url: z.string(),
  label: z.boolean(),
});
const rows = readFileSync(values.file, 'utf8')
  .split('\n')
  .filter((line) => line.trim() !== '')
  .map((line, index) => ({ signalId: `row-${String(index + 1)}`, ...Row.parse(JSON.parse(line)) }));

const model = values.model;
const llm = createLlmClient(apiKey);
const inputPrice = Number(values['input-per-mtok']);
const outputPrice = Number(values['output-per-mtok']);

let inputTokens = 0;
let outputTokens = 0;
let cacheRead = 0;
const verdicts = new Map<string, { relevant: boolean; confidence: number; reason: string }>();
let promptVersion = '';

for (let i = 0; i < rows.length; i += 10) {
  const batch = rows.slice(i, i + 10);
  const call = await llm.triage(
    model,
    batch.map(({ signalId, title, url, excerpt }) => ({ signalId, title, url, excerpt })),
  );
  promptVersion = call.promptVersion;
  inputTokens += call.usage.inputTokens;
  outputTokens += call.usage.outputTokens;
  cacheRead += call.usage.cacheReadTokens;
  for (const verdict of call.result) verdicts.set(verdict.signalId, verdict);
}

const THRESHOLD = 0.6;
let tp = 0;
let fp = 0;
let fn = 0;
let tn = 0;
const misses: string[] = [];
for (const row of rows) {
  const verdict = verdicts.get(row.signalId);
  const predicted = verdict !== undefined && verdict.relevant && verdict.confidence >= THRESHOLD;
  if (predicted && row.label) tp += 1;
  else if (predicted && !row.label) fp += 1;
  else if (!predicted && row.label) fn += 1;
  else tn += 1;
  if (predicted !== row.label) {
    misses.push(
      `${row.label ? 'MISSED' : 'FALSE ALARM'} ${row.title} :: ${verdict?.reason ?? 'no verdict'} (${String(verdict?.confidence ?? 0)})`,
    );
  }
}

const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
const costUsd = (inputTokens * inputPrice + outputTokens * outputPrice) / 1_000_000;

console.log(
  `model ${model}, prompt v${promptVersion}, ${String(rows.length)} rows, threshold ${String(THRESHOLD)}`,
);
console.log(`tp ${String(tp)} fp ${String(fp)} fn ${String(fn)} tn ${String(tn)}`);
console.log(`precision ${precision.toFixed(3)} recall ${recall.toFixed(3)} f1 ${f1.toFixed(3)}`);
console.log(
  `tokens in ${String(inputTokens)} (cache read ${String(cacheRead)}) out ${String(outputTokens)} cost $${costUsd.toFixed(4)}`,
);
if (misses.length > 0) {
  console.log('\nmisclassified:');
  for (const miss of misses) console.log(`  ${miss}`);
}
