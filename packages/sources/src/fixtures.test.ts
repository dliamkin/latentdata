import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseFeed } from './feed.ts';
import { passesPrefilter } from './prefilter.ts';
import { pageLines } from './text.ts';

// recorded with `npm run fixtures:record -- <sourceId>`; the tests never touch the network
export const fixture = (sourceId: string, file: string): string =>
  readFileSync(new URL(`../../../fixtures/sources/${sourceId}/${file}`, import.meta.url), 'utf8');

const INCLUDE = ['voucher', 'free exam', 'free certification', 'certification exam', '100%', '50%'];
const EXCLUDE = ['dumps', 'hiring'];

describe('recorded feeds', () => {
  it('parses the AWS training blog (RSS 2.0)', () => {
    const items = parseFeed(fixture('rss-aws-training-blog', 'response.xml'));
    expect(items).toHaveLength(10);
    const [first] = items;
    expect(first?.url).toMatch(/^https:\/\/aws\.amazon\.com\/blogs\/training-and-certification\//);
    expect(first?.title).toMatch(/microcredentials/i);
    expect(first?.publishedAt).toMatch(/^2026-09-29T/);
    expect(first?.excerpt.length).toBeGreaterThan(50);
    expect(first?.excerpt).not.toMatch(/<[a-z]/);
  });

  it('parses the Google Cloud training feed (Atom)', () => {
    const items = parseFeed(fixture('rss-google-cloud-training-blog', 'response.xml'));
    expect(items).toHaveLength(20);
    expect(items.every((item) => item.url.startsWith('https://'))).toBe(true);
    expect(items.every((item) => item.excerpt.length <= 2000)).toBe(true);
    expect(
      items.filter((i) => passesPrefilter(`${i.title} ${i.excerpt}`, INCLUDE, EXCLUDE)).length,
    ).toBeGreaterThan(0);
  });

  it('parses a subreddit new.rss (Atom) with dates', () => {
    const items = parseFeed(fixture('reddit-awscertifications', 'response.xml'));
    expect(items).toHaveLength(25);
    expect(items.every((item) => item.url.startsWith('https://www.reddit.com/r/'))).toBe(true);
    expect(items.every((item) => item.publishedAt !== null)).toBe(true);
  });

  it('parses the Slickdeals search feed', () => {
    const items = parseFeed(fixture('rss-slickdeals-certification', 'response.xml'));
    expect(items.length).toBeGreaterThan(10);
    expect(items[0]?.title).toMatch(/certification/i);
  });
});

describe('recorded pages', () => {
  it.each(['page-google-gear-getcertified', 'page-isc2-1mcc', 'page-pearsonvue-aws-promos'])(
    '%s reduces to text lines without markup',
    (id) => {
      const lines = pageLines(fixture(id, 'response.html'));
      expect(lines.length).toBeGreaterThan(30);
      expect(lines.join('\n')).not.toMatch(/<\/?[a-z]+>/);
      expect(lines.join('\n')).not.toMatch(/function\s*\(/);
    },
  );
});

describe('recorded commit lists', () => {
  it.each(['github-commits-ms-voucher-tracker', 'github-commits-free-certifications'])(
    '%s is a commit array with messages',
    (id) => {
      const commits = JSON.parse(fixture(id, 'response.json')) as { commit: { message: string } }[];
      expect(Array.isArray(commits)).toBe(true);
      expect(commits.length).toBeGreaterThan(0);
      expect(typeof commits[0]?.commit.message).toBe('string');
    },
  );
});
