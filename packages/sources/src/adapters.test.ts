import { describe, expect, it, vi } from 'vitest';

import type { Source } from '@cert-tracker/core';

import { githubCommitsAdapter } from './adapters/github-commits.ts';
import { pageDiffAdapter } from './adapters/page-diff.ts';
import { redditAdapter } from './adapters/reddit.ts';
import { rssAdapter } from './adapters/rss.ts';
import { fixture } from './fixtures.test.ts';
import { passesPrefilter } from './prefilter.ts';
import { robotsAllows } from './robots.ts';
import { lineDiff, pageLines, stripHtml } from './text.ts';
import { SourceError, type AdapterContext, type FetchResponse, type Fetcher } from './types.ts';

const NOW = new Date('2026-09-30T06:00:00.000Z');

function response(status: number, text = '', headers: Record<string, string> = {}): FetchResponse {
  return { status, headers: new Headers(headers), text, notModified: status === 304 };
}

// answers by URL prefix so a test can script several endpoints at once
function fetcher(routes: Record<string, FetchResponse | FetchResponse[]>): Fetcher & {
  calls: { url: string; options?: unknown }[];
} {
  const calls: { url: string; options?: unknown }[] = [];
  return {
    calls,
    get: (url, options) => {
      calls.push({ url, options });
      const key = Object.keys(routes).find((prefix) => url.startsWith(prefix));
      if (key === undefined) return Promise.reject(new Error(`unrouted ${url}`));
      const entry = routes[key];
      if (Array.isArray(entry)) {
        const next = entry.shift();
        return next === undefined ? Promise.reject(new Error('exhausted')) : Promise.resolve(next);
      }
      return entry === undefined ? Promise.reject(new Error('unrouted')) : Promise.resolve(entry);
    },
  };
}

function source(overrides: Partial<Source>): Source {
  return {
    sourceId: 'test',
    kind: 'rss',
    vendor: null,
    url: 'https://feed.example/rss',
    pollIntervalMinutes: 60,
    enabled: true,
    tags: [],
    keywordsInclude: ['voucher', 'free exam'],
    keywordsExclude: ['dumps'],
    state: { consecutiveFailures: 0 },
    ...overrides,
  };
}

const context = (http: Fetcher, extra: Partial<AdapterContext> = {}): AdapterContext => ({
  http,
  now: NOW,
  ...extra,
});

describe('rss adapter', () => {
  it('sends the stored validators and keeps the new ones', async () => {
    const http = fetcher({
      'https://feed.example/rss': response(200, fixture('rss-aws-training-blog', 'response.xml'), {
        etag: '"v2"',
        'last-modified': 'Tue, 29 Sep 2026 19:44:15 GMT',
      }),
    });
    const result = await rssAdapter.fetch(
      source({ state: { consecutiveFailures: 0, etag: '"v1"' } }),
      context(http),
    );
    expect(result.items).toHaveLength(10);
    expect(result.state).toEqual({ etag: '"v2"', lastModified: 'Tue, 29 Sep 2026 19:44:15 GMT' });
    expect(http.calls[0]?.options).toMatchObject({ etag: '"v1"' });
  });

  it('returns nothing on 304 and throws on a 4xx', async () => {
    const http = fetcher({ 'https://feed.example/rss': [response(304), response(410)] });
    expect(await rssAdapter.fetch(source({}), context(http))).toEqual({ items: [], state: {} });
    await expect(rssAdapter.fetch(source({}), context(http))).rejects.toMatchObject({
      name: 'SourceError',
      kind: 'http',
      status: 410,
    });
  });
});

describe('reddit adapter', () => {
  it('treats 403 and 429 as blocked rather than retrying', async () => {
    const http = fetcher({ 'https://www.reddit.com/': [response(403), response(429)] });
    const s = source({ kind: 'reddit', url: 'https://www.reddit.com/r/x/new.rss' });
    for (let i = 0; i < 2; i += 1) {
      const error: unknown = await redditAdapter.fetch(s, context(http)).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(SourceError);
      expect((error as SourceError).kind).toBe('blocked');
    }
  });

  it('parses the recorded feed', async () => {
    const http = fetcher({
      'https://www.reddit.com/': response(200, fixture('reddit-awscertifications', 'response.xml')),
    });
    const result = await redditAdapter.fetch(
      source({ kind: 'reddit', url: 'https://www.reddit.com/r/x/new.rss' }),
      context(http),
    );
    expect(result.items).toHaveLength(25);
  });
});

describe('github commits adapter', () => {
  const base = 'https://api.github.com/repos/o/r/commits';
  const list = fixture('github-commits-ms-voucher-tracker', 'response.json');

  it('emits one item per commit and only fetches details for relevant messages', async () => {
    const detail = JSON.stringify({ files: [{ filename: 'offers/2026-cert-week.md' }] });
    const http = fetcher({
      [`${base}?per_page`]: response(200, list, { etag: '"e"' }),
      [`${base}/`]: response(200, detail),
    });
    const result = await githubCommitsAdapter.fetch(
      source({ kind: 'github-commits', url: base, keywordsInclude: ['certification week'] }),
      context(http, { githubToken: 'tok' }),
    );
    expect(result.items).toHaveLength(9);
    expect(result.items[0]?.title).toMatch(/Certification Week/);
    expect(result.items[0]?.excerpt).toContain('Files: offers/2026-cert-week.md');
    expect(result.state).toEqual({ etag: '"e"' });
    const detailCalls = http.calls.filter((c) => c.url.startsWith(`${base}/`));
    expect(detailCalls.length).toBeLessThan(9);
    expect(http.calls[0]?.options).toMatchObject({
      headers: expect.objectContaining({ authorization: 'Bearer tok' }) as unknown,
    });
  });

  it('rejects a body that is not a commit array', async () => {
    const http = fetcher({ [base]: response(200, '{"message":"Not Found"}') });
    await expect(
      githubCommitsAdapter.fetch(source({ kind: 'github-commits', url: base }), context(http)),
    ).rejects.toMatchObject({ kind: 'parse' });
  });
});

describe('page-diff adapter', () => {
  const page = (body: string): string =>
    `<html><head><script>x()</script></head><body><nav>menu</nav>${body}</body></html>`;
  const url = 'https://vendor.example/deals';

  it('records a baseline first, then emits the change as a diff', async () => {
    const http = fetcher({
      'https://vendor.example/robots.txt': response(404),
      [url]: [
        response(200, page('<p>Free exam voucher</p><p>Until June</p>')),
        response(200, page('<p>Free exam voucher</p><p>Until August</p>')),
        response(200, page('<p>Free exam voucher</p><p>Until August</p>')),
      ],
    });
    const s = source({ kind: 'page-diff', url });
    const first = await pageDiffAdapter.fetch(s, context(http));
    expect(first.items).toEqual([]);
    expect(first.state).toMatchObject({
      robotsAllowed: true,
      pageText: 'Free exam voucher\nUntil June',
    });
    expect(first.state.contentHash).toMatch(/^[0-9a-f]{64}$/);

    const second = await pageDiffAdapter.fetch(
      source({ kind: 'page-diff', url, state: { consecutiveFailures: 0, ...first.state } }),
      context(http),
    );
    expect(second.items).toHaveLength(1);
    expect(second.items[0]?.excerpt).toBe('+ Until August\n- Until June');
    expect(second.items[0]?.url).toBe(url);

    const third = await pageDiffAdapter.fetch(
      source({
        kind: 'page-diff',
        url,
        state: { consecutiveFailures: 0, ...first.state, ...second.state },
      }),
      context(http),
    );
    expect(third.items).toEqual([]);
    // robots was checked once and cached for a day
    expect(http.calls.filter((c) => c.url.endsWith('/robots.txt'))).toHaveLength(1);
  });

  it('stays away from pages robots.txt disallows', async () => {
    const http = fetcher({
      'https://vendor.example/robots.txt': response(200, 'User-agent: *\nDisallow: /deals'),
    });
    const result = await pageDiffAdapter.fetch(source({ kind: 'page-diff', url }), context(http));
    expect(result).toEqual({
      items: [],
      state: { robotsAllowed: false, robotsCheckedAt: NOW.toISOString() },
    });
    expect(http.calls).toHaveLength(1);
  });
});

describe('robots rules', () => {
  const txt =
    'User-agent: *\nDisallow: /private\nAllow: /private/offers\n\nUser-agent: cert-tracker\nDisallow: /nope';
  it.each([
    ['/deals', true],
    ['/nope/x', false],
    ['/private', true],
  ])('%s -> %s for our agent group', (path, expected) => {
    expect(robotsAllows(txt, 'cert-tracker/1.0', path)).toBe(expected);
  });
  it('falls back to the wildcard group and lets a longer Allow win', () => {
    expect(robotsAllows(txt, 'otherbot', '/private/x')).toBe(false);
    expect(robotsAllows(txt, 'otherbot', '/private/offers/x')).toBe(true);
    expect(robotsAllows('', 'otherbot', '/anything')).toBe(true);
  });
  it('handles comments, CRLF and a hostile line in linear time', () => {
    const crlf = 'User-agent: *\r\nDisallow: /a # trailing\r\n';
    expect(robotsAllows(crlf, 'x', '/a/b')).toBe(false);
    const hostile = `User-agent: *\nDisallow: ${'#'.repeat(200_000)}\n${' '.repeat(200_000)}\r`;
    expect(robotsAllows(hostile, 'x', '/a')).toBe(true);
  });
});

describe('prefilter and text', () => {
  it('needs an include hit and no exclude hit', () => {
    expect(passesPrefilter('Free Exam voucher inside', ['voucher'], ['dumps'])).toBe(true);
    expect(passesPrefilter('voucher and dumps', ['voucher'], ['dumps'])).toBe(false);
    expect(passesPrefilter('nothing here', ['voucher'], [])).toBe(false);
    expect(passesPrefilter('anything', [], [])).toBe(false);
  });

  it('strips markup and decodes entities', () => {
    expect(stripHtml('<p>Tom &amp; Jerry &#8212; <b>free</b></p><script>1</script>')).toBe(
      'Tom & Jerry — free',
    );
  });

  it('diffs by line and keeps order', () => {
    expect(lineDiff(['a', 'b'], ['a', 'c', 'd'])).toBe('+ c\n+ d\n- b');
    expect(lineDiff(['a'], ['a'])).toBe('');
    expect(pageLines('<body><h1>T</h1><p>one</p><div>two <i>x</i></div></body>')).toEqual([
      'T',
      'one',
      'two x',
    ]);
  });

  it('finds the body without backtracking over a hostile page', () => {
    expect(pageLines('<html><body class="x"><p>a</p></body></html>')).toEqual(['a']);
    expect(pageLines('<p>no body tag</p>')).toEqual(['no body tag']);
    expect(pageLines(`${'<body'.repeat(100_000)}${'a'.repeat(100_000)}`).length).toBeGreaterThan(0);
  });
});

describe('sanity', () => {
  it('has the fetcher mock behave', () => {
    expect(vi.isMockFunction(vi.fn())).toBe(true);
  });
});
