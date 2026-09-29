import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { generateJsonSchemas } from './jsonSchema.ts';

const read = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../schema/${name}.schema.json`, import.meta.url), 'utf8'));

describe('generated JSON schemas', () => {
  const generated = generateJsonSchemas();

  it.each(['offer', 'snapshot'] as const)('%s.schema.json is up to date', (name) => {
    expect(read(name)).toStrictEqual(generated[name]);
  });
});
