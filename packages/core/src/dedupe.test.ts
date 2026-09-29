import { describe, expect, it } from 'vitest';

import { normalizeTitle, normalizeUrl, signalFingerprint } from './dedupe.ts';

describe('normalizeUrl', () => {
  it.each([
    ['https://WWW.Example.com/Path/', 'https://example.com/Path'],
    ['https://example.com/', 'https://example.com/'],
    ['https://example.com/a#section', 'https://example.com/a'],
    ['https://example.com/a?utm_source=x&b=2&a=1', 'https://example.com/a?a=1&b=2'],
    ['https://example.com/a?fbclid=abc', 'https://example.com/a'],
    ['https://example.com:443/a', 'https://example.com/a'],
    ['  https://example.com/a  ', 'https://example.com/a'],
    ['not a url', 'not a url'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeUrl(input)).toBe(expected);
  });
});

describe('normalizeTitle', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalizeTitle('  Free   Exam\nVoucher ')).toBe('free exam voucher');
  });
});

describe('signalFingerprint', () => {
  it('is a sha256 hex digest', () => {
    expect(signalFingerprint('https://example.com', 'x')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('ignores tracking noise and case', () => {
    const a = signalFingerprint('https://Example.com/post?utm_medium=rss', 'Free Exam');
    const b = signalFingerprint('https://example.com/post', 'free  exam');
    expect(a).toBe(b);
  });

  it('separates different titles on the same url', () => {
    const a = signalFingerprint('https://example.com/post', 'one');
    const b = signalFingerprint('https://example.com/post', 'two');
    expect(a).not.toBe(b);
  });
});
