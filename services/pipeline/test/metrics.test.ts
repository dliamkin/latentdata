import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { METRIC_NAMES } from '../src/lib/telemetry.ts';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(`${path}/`);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

// CloudWatch gives ten custom metrics for free and bills the eleventh. The list is the budget;
// this is what stops a stray name from quietly becoming a line on the invoice.
describe('custom metrics', () => {
  it('are exactly ten', () => {
    expect(new Set(METRIC_NAMES).size).toBe(10);
  });

  it('are only ever emitted through count(), with a name from the list', () => {
    const emitted = new Set<string>();
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/\bcount\(\s*'([^']+)'/g)) {
        if (match[1] !== undefined) emitted.add(match[1]);
      }
      if (!file.endsWith('telemetry.ts')) {
        expect(text, `${file} calls addMetric directly`).not.toMatch(/\.addMetric\(/);
      }
    }
    expect(emitted.size).toBeGreaterThan(0);
    for (const name of emitted) expect(METRIC_NAMES).toContain(name);
  });
});
