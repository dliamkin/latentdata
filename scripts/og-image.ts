import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { chromium } from '@playwright/test';

import { repoRoot } from './lib/paths.ts';

// the link-preview card for latentdata.org. Chat apps and social sites never run the bundle, so
// it's a committed PNG; drawn in a browser so it gets the site's own fonts and the dark logo.
// Re-run after changing the logo or the copy: npm run og:image

const WIDTH = 1200;
const HEIGHT = 630;

const dataUrl = (path: string, type: string): string =>
  `data:${type};base64,${readFileSync(`${repoRoot}${path}`).toString('base64')}`;

const fontFace = (family: string, file: string): string => `
  @font-face {
    font-family: '${family}';
    font-weight: 100 900;
    src: url(${dataUrl(`node_modules/@fontsource-variable/${file}`, 'font/woff2')}) format('woff2');
  }`;

// colours are the Grove dark tokens in apps/web/src/styles/tokens.css
const html = `<!doctype html>
<html>
  <head>
    <style>
      ${fontFace('Albert Sans', 'albert-sans/files/albert-sans-latin-wght-normal.woff2')}
      ${fontFace('Source Code Pro', 'source-code-pro/files/source-code-pro-latin-wght-normal.woff2')}
      * { box-sizing: border-box; margin: 0; }
      body {
        width: ${String(WIDTH)}px;
        height: ${String(HEIGHT)}px;
        position: relative;
        overflow: hidden;
        background: #141a16;
        color: #d5dde9;
        font-family: 'Albert Sans', sans-serif;
      }
      .glow {
        position: absolute;
        inset: 0;
        background: radial-gradient(900px 500px at 85% 0%, rgb(90 164 120 / 0.14), transparent 70%);
      }
      main { position: absolute; inset: 64px 80px 74px; display: flex; flex-direction: column; }
      img { width: 369px; height: 120px; margin-left: -6px; }
      h1 {
        margin-top: auto;
        max-width: 980px;
        font-size: 68px;
        font-weight: 700;
        line-height: 1.08;
        letter-spacing: -0.015em;
        color: #eef2f7;
      }
      h1 em { font-style: normal; color: #e9b23a; }
      p { margin-top: 24px; font-size: 30px; color: #98a6b4; }
      .url {
        margin-top: 36px;
        font-family: 'Source Code Pro', monospace;
        font-size: 22px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #5aa478;
      }
      .strip { position: absolute; left: 0; right: 0; bottom: 0; height: 10px; background: #3f7a55; }
    </style>
  </head>
  <body>
    <div class="glow"></div>
    <main>
      <img src="${dataUrl('apps/web/public/logo-dark.png', 'image/png')}" alt="">
      <h1>Free IT certification exams, <em>tracked and verified.</em></h1>
      <p>Vouchers, free training and discount codes, with dates and eligibility.</p>
      <div class="url">latentdata.org</div>
    </main>
    <div class="strip"></div>
  </body>
</html>`;

const { values } = parseArgs({
  options: { out: { type: 'string', default: `${repoRoot}apps/web/public/og-image.png` } },
});

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHANNEL === undefined ? {} : { channel: process.env.PLAYWRIGHT_CHANNEL },
);
try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  await page.setContent(html);
  // scripts/ has no DOM lib, so the page-side expression goes in as a string
  await page.evaluate('document.fonts.ready');
  writeFileSync(values.out, await page.screenshot({ type: 'png' }));
  console.log(`wrote ${values.out}`);
} finally {
  await browser.close();
}
