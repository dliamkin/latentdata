import { describe, expect, it } from 'vitest';

import { ELIGIBILITIES } from '@cert-tracker/core';

import { CLAIM_ROLES, parseClaim, toggleNone, toggleRole } from './claim.ts';

describe('claim', () => {
  it('offers every eligibility but the one everybody has', () => {
    expect([...CLAIM_ROLES].sort()).toEqual(ELIGIBILITIES.filter((who) => who !== 'public').sort());
  });

  it('adds and removes a role, and forgets the choice with the last one', () => {
    expect(toggleRole(null, 'student')).toEqual(['student']);
    expect(toggleRole(['student'], 'partner')).toEqual(['student', 'partner']);
    expect(toggleRole(['student', 'partner'], 'student')).toEqual(['partner']);
    expect(toggleRole(['partner'], 'partner')).toBeNull();
    // a role replaces "none of these"
    expect(toggleRole([], 'customer')).toEqual(['customer']);
  });

  it('treats "none of these" as an answer of its own', () => {
    expect(toggleNone(null)).toEqual([]);
    expect(toggleNone(['student'])).toEqual([]);
    expect(toggleNone([])).toBeNull();
  });

  it('reads back only what it could have written', () => {
    expect(parseClaim(null)).toBeNull();
    expect(parseClaim('[]')).toEqual([]);
    expect(parseClaim('["student","public","nonsense"]')).toEqual(['student']);
    expect(parseClaim('{"student":true}')).toBeNull();
    expect(parseClaim('not json')).toBeNull();
  });
});
