import { defineConfig, type Plugin } from 'vitest/config';

// the Lambda bundles get prompt files through esbuild's text loader; vitest needs the same
function markdownAsText(): Plugin {
  return {
    name: 'markdown-as-text',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('.md')) return null;
      return { code: `export default ${JSON.stringify(code)};`, map: null };
    },
  };
}

export default defineConfig({
  plugins: [markdownAsText()],
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // the handlers log through Powertools; the tests assert on behaviour, not on log lines
    env: { POWERTOOLS_LOG_LEVEL: 'SILENT' },
  },
});
