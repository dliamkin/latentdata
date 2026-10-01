import { describe, expect, it } from 'vitest';

import { catalogMatch } from './catalog.ts';
import type { CatalogEntry } from './schemas.ts';

function entry(over: Partial<CatalogEntry>): CatalogEntry {
  return {
    id: 'aws-developer-associate',
    name: 'AWS Certified Developer – Associate',
    vendor: 'AWS',
    kind: 'exam',
    category: 'dev',
    tracks: ['software'],
    technologies: ['aws'],
    examCode: 'DVA-C02',
    listPriceUsd: 150,
    priceNote: '',
    aliases: ['Developer Associate'],
    rank: 1,
    url: 'https://aws.amazon.com/certification/certified-developer-associate/',
    lastVerified: '2026-10-01',
    notes: '',
    ...over,
  };
}

const offer = (vendor: string, certifications: string[], examCode: string | null = null) => ({
  vendor,
  certifications,
  examCode,
});

describe('catalogMatch', () => {
  it.each([
    ['the full name', offer('AWS', ['AWS Certified Developer - Associate']), 'named'],
    ['an alias', offer('AWS', ['Cloud Practitioner', 'Developer Associate']), 'named'],
    ['the exam code in the code field', offer('AWS', ['Developer'], 'DVA-C02 / SAA-C03'), 'named'],
    ['the exam code from another vendor', offer('Pearson', ['DVA-C02']), 'named'],
    ['any exam of the vendor', offer('AWS', ['Any AWS Certification exam']), 'vendor-wide'],
    ['a different credential of the vendor', offer('AWS', ['Solutions Architect Associate']), null],
    ['the same words from another vendor', offer('Acme', ['Developer Associate']), null],
    ['any exam of another vendor', offer('Oracle', ['Any Oracle Certification exam']), null],
  ] as const)('%s', (_case, ref, expected) => {
    expect(catalogMatch(entry({}), ref)).toBe(expected);
  });

  it('matches whole words only', () => {
    const cc = entry({ name: 'Certified in Cybersecurity', vendor: 'ISC2', examCode: null });
    const withAlias = { ...cc, aliases: ['CC'] };
    expect(catalogMatch(withAlias, offer('ISC2', ['CCSP']))).toBeNull();
    expect(catalogMatch(withAlias, offer('ISC2', ['Certified in Cybersecurity (CC)']))).toBe(
      'named',
    );
  });

  it('keeps + and # as part of a name', () => {
    const security = entry({
      name: 'CompTIA Security+',
      vendor: 'CompTIA',
      examCode: 'SY0-701',
      aliases: ['Security+'],
    });
    expect(catalogMatch(security, offer('CompTIA', ['Security+ and Network+']))).toBe('named');
    expect(catalogMatch(security, offer('CompTIA', ['Security fundamentals']))).toBeNull();
  });

  it('reaches another vendor through a vendor-wide offer that names it', () => {
    const github = entry({ name: 'GitHub Foundations', vendor: 'GitHub', examCode: 'GH-900' });
    expect(catalogMatch(github, offer('Microsoft', ['One Microsoft or GitHub exam']))).toBe(
      'vendor-wide',
    );
  });

  it('does not stretch a vendor-wide exam offer over a course', () => {
    const course = entry({ kind: 'course', examCode: null, aliases: [] });
    expect(catalogMatch(course, offer('AWS', ['Any AWS Certification exam']))).toBeNull();
  });
});
