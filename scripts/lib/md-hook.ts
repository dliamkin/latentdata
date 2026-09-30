import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

// The Lambda bundles get the prompt files through esbuild's text loader and vitest through a
// plugin. A script that runs under plain Node gets them through this hook: node --import
registerHooks({
  load(url, context, nextLoad) {
    if (!url.endsWith('.md')) return nextLoad(url, context);
    const text = readFileSync(fileURLToPath(url), 'utf8');
    return {
      format: 'module',
      source: `export default ${JSON.stringify(text)};`,
      shortCircuit: true,
    };
  },
});
