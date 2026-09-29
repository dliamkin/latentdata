import { describe, expect, it, vi } from 'vitest';

import { AdapterError, isAdapterError } from './errors.ts';
import { createHttpClient } from './http.ts';
import { anchorsFor, createLivenessChecker, isBlockedHost, pageText } from './liveness.ts';
import { backoffDelay, withRetry } from './retry.ts';

const noSleep = (): Promise<void> => Promise.resolve();
const retryable = (): AdapterError =>
  new AdapterError('test', 'http', 'boom', { retryable: true, status: 503 });

describe('withRetry', () => {
  it('returns the first success', async () => {
    const fn = vi.fn().mockRejectedValueOnce(retryable()).mockResolvedValueOnce('ok');
    await expect(
      withRetry(fn, { attempts: 3, baseDelayMs: 1, maxDelayMs: 1, sleep: noSleep }),
    ).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('stops at the attempt limit', async () => {
    const fn = vi.fn().mockRejectedValue(retryable());
    await expect(
      withRetry(fn, { attempts: 3, baseDelayMs: 1, maxDelayMs: 1, sleep: noSleep }),
    ).rejects.toThrow('boom');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry what is not retryable', async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(new AdapterError('test', 'conflict', 'no', { retryable: false }));
    await expect(
      withRetry(fn, { attempts: 3, baseDelayMs: 1, maxDelayMs: 1, sleep: noSleep }),
    ).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('backs off with full jitter under a cap', () => {
    const options = { attempts: 5, baseDelayMs: 100, maxDelayMs: 500, random: () => 0.5 };
    expect(backoffDelay(1, options)).toBe(50);
    expect(backoffDelay(2, options)).toBe(100);
    expect(backoffDelay(9, options)).toBe(250);
  });
});

function fakeFetch(responses: (Response | Error)[]): typeof fetch {
  const queue = [...responses];
  return vi.fn(() => {
    const next = queue.shift();
    if (next === undefined) return Promise.reject(new Error('no more responses'));
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
}

const client = (fetchImpl: typeof fetch) =>
  createHttpClient({
    userAgent: 'cert-tracker-test',
    fetchImpl,
    retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 1, sleep: noSleep },
  });

describe('http client', () => {
  it('sends the user agent and conditional headers', async () => {
    const fetchImpl = fakeFetch([new Response('hello', { status: 200 })]);
    const response = await client(fetchImpl).get('https://example.com', {
      etag: '"abc"',
      lastModified: 'Tue, 29 Sep 2026 00:00:00 GMT',
    });
    expect(response).toMatchObject({ status: 200, text: 'hello', notModified: false });
    expect(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.headers).toEqual({
      'user-agent': 'cert-tracker-test',
      'if-none-match': '"abc"',
      'if-modified-since': 'Tue, 29 Sep 2026 00:00:00 GMT',
    });
  });

  it('reports 304 as not modified', async () => {
    const response = await client(fakeFetch([new Response(null, { status: 304 })])).get(
      'https://example.com',
    );
    expect(response.notModified).toBe(true);
  });

  it('retries a 5xx and a network error, then succeeds', async () => {
    const fetchImpl = fakeFetch([
      new Response('', { status: 503 }),
      new TypeError('fetch failed'),
      new Response('ok', { status: 200 }),
    ]);
    await expect(client(fetchImpl).get('https://example.com')).resolves.toMatchObject({
      text: 'ok',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('surfaces a 429 with its Retry-After and does not retry it', async () => {
    const fetchImpl = fakeFetch([
      new Response('', { status: 429, headers: { 'retry-after': '120' } }),
    ]);
    const error: unknown = await client(fetchImpl)
      .get('https://example.com')
      .catch((e: unknown) => e);
    expect(isAdapterError(error) && error.kind).toBe('rate-limited');
    expect(isAdapterError(error) && error.retryAfterMs).toBe(120_000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('returns a 404 to the caller rather than throwing', async () => {
    const response = await client(fakeFetch([new Response('gone', { status: 404 })])).get(
      'https://example.com',
    );
    expect(response.status).toBe(404);
  });

  it('caps the body', async () => {
    const response = await client(fakeFetch([new Response('x'.repeat(50))])).get(
      'https://example.com',
      { maxBytes: 10 },
    );
    expect(response.text).toHaveLength(10);
  });
});

describe('liveness', () => {
  const target = {
    vendor: 'Vendor',
    examCode: 'VA-100 / VB-200',
    sourceUrl: 'https://vendor.example/t',
  };

  it('knows the hosts not worth asking', () => {
    expect(isBlockedHost('https://mylearn.oracle.com/x')).toBe(true);
    expect(isBlockedHost('https://www.reddit.com/r/x')).toBe(true);
    expect(isBlockedHost('https://www.oracle.com/x')).toBe(false);
    expect(isBlockedHost('not a url')).toBe(true);
  });

  it('builds anchors from the vendor, the exam codes and the generic words', () => {
    expect(anchorsFor(target)).toEqual([
      'vendor',
      'va-100',
      'vb-200',
      'voucher',
      'free',
      'certification',
    ]);
    expect(anchorsFor({ vendor: 'X', examCode: null })).toEqual([
      'x',
      'voucher',
      'free',
      'certification',
    ]);
  });

  it('strips markup, scripts and styles', () => {
    expect(pageText('<style>a{}</style><p>Free <b>Voucher</b></p><script>free()</script>')).toBe(
      ' free voucher ',
    );
  });

  it.each([
    [new Response('<p>Get your voucher</p>'), 'alive'],
    [new Response('<p>Page moved</p>'), 'changed'],
    [new Response('', { status: 404 }), 'gone'],
    [new Response('', { status: 410 }), 'gone'],
    [new Response('', { status: 403 }), 'unknown'],
    [new TypeError('fetch failed'), 'unknown'],
  ])('%s -> %s', async (response, expected) => {
    const http = createHttpClient({
      userAgent: 't',
      fetchImpl: fakeFetch([response]),
      retry: { attempts: 1, baseDelayMs: 1, maxDelayMs: 1, sleep: noSleep },
    });
    expect(await createLivenessChecker(http, noSleep).check(target)).toBe(expected);
  });

  it('skips blocked hosts without a request', async () => {
    const fetchImpl = fakeFetch([]);
    const checker = createLivenessChecker(client(fetchImpl), noSleep);
    expect(await checker.check({ ...target, sourceUrl: 'https://education.oracle.com/x' })).toBe(
      'skipped',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('waits out the rest of the second before asking the same host again', async () => {
    const sleep = vi.fn(noSleep);
    let clock = 1000;
    const http = client(fakeFetch([new Response('voucher'), new Response('voucher')]));
    const checker = createLivenessChecker(http, sleep, () => clock);
    await checker.check(target);
    clock = 1300;
    await checker.check(target);
    expect(sleep).toHaveBeenCalledWith(700);
  });
});
