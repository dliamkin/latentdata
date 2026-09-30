import {
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  autoAcceptable,
  candidateLinks,
  offerFromCandidate,
  runVerify,
  type VerifyDeps,
} from '../src/handlers/verify.ts';
import { offerToItem } from '../src/lib/repo/index.ts';
import { extraction, fakeBudget, fakeHttp, fakeLlm, response } from './fakes.ts';
import { TABLE, docMock, offer } from './helpers.ts';

const NOW = new Date('2026-09-30T09:00:00.000Z');
const { doc, mock } = docMock();
const PAGE = 'https://learn.microsoft.com/credentials/deals';
const HTML = `<html><body><h1>Cloud Week 2026</h1><p>Free exam voucher AZ-900 from 1 October to 31 October.</p>
<a href="/credentials/terms">Terms</a><a href="https://www.microsoft.com/other">Other</a>
<a href="https://blog.example/x">blog</a><a href="/img.png">img</a><a href="/login">login</a></body></html>`;

const message = {
  signalId: '01ARZ3NDEKTSV4RRFFQ69G5FA1',
  sourceId: 'rss-vendor-blog',
  fingerprint: '1'.padEnd(64, '0'),
  seenAt: NOW.toISOString(),
  url: PAGE,
  title: 'Cloud Week 2026',
};

function deps(overrides: Partial<VerifyDeps> = {}): VerifyDeps {
  return {
    doc,
    table: TABLE,
    http: fakeHttp({
      [PAGE]: response(200, HTML),
      'https://learn.microsoft.com/credentials/terms': response(200, '<p>Terms text</p>'),
      'https://www.microsoft.com/other': response(404),
    }),
    llm: fakeLlm(),
    budget: fakeBudget(),
    model: 'claude-sonnet-5-5',
    now: () => NOW,
    ...overrides,
  };
}

const signalState = (): unknown =>
  mock
    .commandCalls(UpdateCommand)
    .map((c): unknown => c.args[0].input.ExpressionAttributeValues?.[':state'])
    .filter((s) => s !== undefined)
    .at(-1);

beforeEach(() => {
  mock.reset();
  mock.on(UpdateCommand).resolves({});
  mock.on(PutCommand).resolves({});
  mock.on(TransactWriteCommand).resolves({});
  mock
    .on(QueryCommand)
    .resolves({ Items: [offerToItem(offer({ id: 'aws-existing-2026', vendor: 'AWS' }))] });
});

describe('candidateLinks', () => {
  it('prefers same-site links, then vendor domains, and skips assets and login pages', () => {
    expect(candidateLinks(HTML, PAGE)).toEqual([
      'https://learn.microsoft.com/credentials/terms',
      'https://www.microsoft.com/other',
    ]);
  });
});

describe('auto-accept rule', () => {
  const base = { ...extraction() };
  const candidate = (overrides: Partial<typeof base> = {}) => {
    const e = { ...base, ...overrides };
    return {
      candidateId: '01ARZ3NDEKTSV4RRFFQ69G5FA9',
      stage: 'verified' as const,
      confidence: e.confidence,
      matchesExistingId: e.matchesExistingId,
      signalIds: [],
      promptVersion: '1',
      model: 'm',
      llmRationale: e.rationale,
      createdAt: NOW.toISOString(),
      name: e.name,
      vendor: e.vendor,
      category: e.category,
      certifications: e.certifications,
      examCode: e.examCode,
      whatIsFree: e.whatIsFree,
      cost: e.cost,
      credentialWeight: e.credentialWeight,
      eligibility: e.eligibility,
      regions: e.regions,
      windowStart: e.windowStart,
      windowEnd: e.windowEnd,
      status: 'active' as const,
      recurring: e.recurring,
      requirements: e.requirements,
      url: e.url,
      sourceUrl: e.sourceUrl,
      lastVerified: '2026-09-30',
      verificationNote: '',
      notes: '',
    };
  };

  it.each([
    ['high confidence on the vendor domain', {}, true],
    ['medium confidence', { confidence: 'medium' as const }, false],
    ['an update to a known offer', { matchesExistingId: 'aws-existing-2026' }, false],
    ['a third-party source page', { sourceUrl: 'https://slickdeals.net/x' }, false],
  ])('%s', (_name, overrides, expected) => {
    expect(autoAcceptable(candidate(overrides), [])).toBe(expected);
  });

  it('refuses when the slug already exists, and otherwise builds an unverified scan offer', () => {
    const c = candidate();
    const slug = 'microsoft-vendor-cloud-week-2026';
    expect(autoAcceptable(c, [offer({ id: slug })])).toBe(false);
    const built = offerFromCandidate(c, [offer({ id: 'other' })], 'https://feed.example/post', NOW);
    expect(built).toMatchObject({
      id: slug,
      status: 'unverified',
      addedBy: 'scan',
      addedAt: '2026-09-30',
      lastVerified: '2026-09-30',
      verificationNote: expect.stringContaining(
        'auto-accepted from https://feed.example/post',
      ) as unknown,
    });
    expect(built).not.toHaveProperty('candidateId');
  });
});

describe('runVerify', () => {
  it('parks the signal when the budget is spent', async () => {
    const d = deps({ budget: fakeBudget(false) });
    expect(await runVerify(d, message)).toBe('deferred');
    expect(signalState()).toBe('deferred');
    expect(d.llm.extract).not.toHaveBeenCalled();
  });

  it('gives up without a retry when the page cannot be read', async () => {
    const d = deps({ http: fakeHttp({ [PAGE]: response(404) }) });
    expect(await runVerify(d, message)).toBe('unreachable');
    expect(signalState()).toBe('verify-failed');
  });

  it('auto-accepts a confident vendor-page offer in one transaction', async () => {
    const d = deps();
    expect(await runVerify(d, message)).toBe('auto-accepted');
    const items = mock.commandCalls(TransactWriteCommand)[0]?.args[0].input.TransactItems ?? [];
    expect(items).toHaveLength(5);
    expect(items[1]?.Put?.Item).toMatchObject({
      type: 'offer.discovered',
      audience: 'public',
      payload: { unverified: true },
    });
    expect(items[2]?.Put?.Item).toMatchObject({
      entity: 'OFFER',
      status: 'unverified',
      addedBy: 'scan',
      id: 'microsoft-vendor-cloud-week-2026',
    });
    expect(items[3]?.Put?.Item).toMatchObject({
      entity: 'CANDIDATE',
      stage: 'approved',
      decidedBy: 'auto',
    });
    expect(items[4]?.Update?.Key).toEqual({ PK: 'META#system', SK: 'META' });
    expect(signalState()).toBe('verified');
    // the page and one linked same-site page were read, in that order
    expect((d.http as ReturnType<typeof fakeHttp>).calls.slice(0, 2)).toEqual([
      PAGE,
      'https://learn.microsoft.com/credentials/terms',
    ]);
    const input = (d.llm as ReturnType<typeof fakeLlm>).extractCalls[0] as {
      pageText: string;
      offers: unknown[];
    };
    expect(input.pageText).toContain('Free exam voucher');
    expect(input.pageText).toContain('Terms text');
    expect(input.offers).toEqual([
      { id: 'aws-existing-2026', name: offer().name, vendor: 'AWS', windowEnd: '2026-12-31' },
    ]);
  });

  it('files a candidate for review when confidence is not high', async () => {
    const d = deps({ llm: fakeLlm({ extractions: [extraction({ confidence: 'medium' })] }) });
    expect(await runVerify(d, message)).toBe('candidate');
    const put = mock
      .commandCalls(PutCommand)
      .find((c) => c.args[0].input.Item?.entity === 'CANDIDATE');
    expect(put?.args[0].input.Item).toMatchObject({
      stage: 'verified',
      confidence: 'medium',
      signalIds: [message.signalId],
    });
    const event =
      mock.commandCalls(TransactWriteCommand)[0]?.args[0].input.TransactItems?.[1]?.Put?.Item;
    expect(event).toMatchObject({ type: 'candidate.needs_review', audience: 'admin' });
  });

  it('searches once when the page lacks dates, then extracts again with the notes', async () => {
    const llm = fakeLlm({
      extractions: [
        extraction({ windowStart: null, windowEnd: null, confidence: 'medium' }),
        extraction(),
      ],
      searchNotes: 'Vendor page says 1-31 October 2026.',
    });
    const d = deps({ llm });
    expect(await runVerify(d, message)).toBe('auto-accepted');
    expect(llm.searchCalls).toBe(1);
    expect(llm.extractCalls).toHaveLength(2);
    expect((llm.extractCalls[1] as { searchNotes?: string }).searchNotes).toMatch(/October/);
    expect((d.budget as ReturnType<typeof fakeBudget>).recorded).toHaveLength(3);
  });

  it('marks the signal verified with nothing filed when the page is not an offer', async () => {
    const d = deps({ llm: fakeLlm({ extractions: [extraction({ isOffer: false })] }) });
    expect(await runVerify(d, message)).toBe('not-offer');
    expect(signalState()).toBe('verified');
    expect(
      mock.commandCalls(PutCommand).some((c) => c.args[0].input.Item?.entity === 'CANDIDATE'),
    ).toBe(false);
  });

  it('logs and gives up when the answer does not parse or violates an invariant', async () => {
    expect(await runVerify(deps({ llm: fakeLlm({ extractions: [null] }) }), message)).toBe(
      'parse-failed',
    );
    expect(signalState()).toBe('verify-failed');
    mock.reset();
    mock.on(UpdateCommand).resolves({});
    mock.on(QueryCommand).resolves({ Items: [] });
    const invalid = extraction({ whatIsFree: 'partial', cost: null });
    expect(await runVerify(deps({ llm: fakeLlm({ extractions: [invalid] }) }), message)).toBe(
      'invalid',
    );
  });
});
