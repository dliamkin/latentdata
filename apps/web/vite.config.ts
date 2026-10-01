import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

const FIXTURE_SNAPSHOT = '../../fixtures/web/snapshot.fixture.json';
const THEMES: readonly string[] = ['lara-light-blue', 'lara-dark-blue'];
const SITE_URL = 'https://latentdata.org';

const require = createRequire(import.meta.url);
const themeFile = (name: string): string =>
  require.resolve(`primereact/resources/themes/${name}/theme.css`);

// the theme stylesheets are served unhashed under /themes so index.html can link the right one
// before any JavaScript runs; the fonts they declare are never requested (system font stack)
function themeAssets(): Plugin {
  return {
    name: 'theme-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = /^\/themes\/([a-z-]+)\/theme\.css$/.exec(req.url ?? '')?.[1];
        if (name === undefined || !THEMES.includes(name)) {
          next();
          return;
        }
        res.setHeader('Content-Type', 'text/css');
        res.end(readFileSync(themeFile(name)));
      });
    },
    generateBundle() {
      for (const name of THEMES) {
        this.emitFile({
          type: 'asset',
          fileName: `themes/${name}/theme.css`,
          source: readFileSync(themeFile(name)),
        });
      }
    },
  };
}

// one URL; lastmod moves with each data snapshot so crawlers come back after the publisher commits
function sitemap(snapshotPath: string): Plugin {
  return {
    name: 'sitemap',
    generateBundle() {
      const { generatedAt } = JSON.parse(readFileSync(snapshotPath, 'utf8')) as {
        generatedAt: string;
      };
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          `  <url><loc>${SITE_URL}/</loc><lastmod>${generatedAt}</lastmod></url>`,
          '</urlset>',
          '',
        ].join('\n'),
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const isTest = mode === 'test';
  // tests and e2e builds run against the fixture so assertions don't move with the live data
  const snapshotPath =
    process.env.SNAPSHOT_PATH ?? (isTest ? FIXTURE_SNAPSHOT : './src/data/snapshot.json');
  const snapshotFile = fileURLToPath(new URL(snapshotPath, import.meta.url));
  const alias: Record<string, string> = { '@snapshot': snapshotFile };
  if (isTest) {
    // the PWA plugin is off under vitest, so its virtual module needs a stand-in
    alias['virtual:pwa-register/react'] = fileURLToPath(
      new URL('./src/test/pwa-register.stub.ts', import.meta.url),
    );
  }

  return {
    plugins: [
      react(),
      themeAssets(),
      sitemap(snapshotFile),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        registerType: 'prompt',
        injectRegister: false,
        disable: isTest,
        manifest: {
          name: 'Cert Promo Tracker',
          short_name: 'Cert Promos',
          description: 'Free and discounted IT certification promotions, tracked and verified.',
          start_url: '/',
          display: 'standalone',
          background_color: '#141a16',
          theme_color: '#141a16',
          icons: [
            { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
            {
              src: '/pwa-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        injectManifest: {
          // the icon font's legacy formats are never requested and don't belong in the precache
          globPatterns: ['**/*.{js,css,html,png,woff2}'],
          // only link-preview crawlers fetch this; no reason to ship it to every install
          globIgnores: ['**/node_modules/**', 'og-image.png'],
        },
      }),
    ],
    resolve: { alias },
    build: {
      target: 'es2022',
    },
    preview: {
      port: 4173,
      strictPort: true,
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      css: false,
      // the table tests drive a full PrimeReact DataTable through jsdom; five seconds is tight
      // once the other workspaces' suites share the machine
      testTimeout: 20_000,
    },
  };
});
