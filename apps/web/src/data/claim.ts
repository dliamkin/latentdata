import { useCallback, useState } from 'react';

import type { Claim, ClaimRole } from './offers.ts';

export const CLAIM_KEY = 'cert-tracker:claim:v1';

// in the order the buttons show them: the groups most visitors belong to first
export const CLAIM_ROLES: readonly ClaimRole[] = [
  'student',
  'partner',
  'customer',
  'event-attendee',
  'need-based',
];

function isClaimRole(value: unknown): value is ClaimRole {
  return (CLAIM_ROLES as readonly unknown[]).includes(value);
}

// pressing a role adds or removes it; taking the last one off is the same as never having said
export function toggleRole(claim: Claim, role: ClaimRole): Claim {
  const current = claim ?? [];
  if (!current.includes(role)) return [...current, role];
  const next = current.filter((r) => r !== role);
  return next.length === 0 ? null : next;
}

// "none of these" is the empty list; pressing it again stops hiding anything
export function toggleNone(claim: Claim): Claim {
  return claim !== null && claim.length === 0 ? null : [];
}

export function parseClaim(text: string | null): Claim {
  if (text === null) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.filter(isClaimRole) : null;
  } catch {
    return null;
  }
}

function storedClaim(): Claim {
  try {
    return parseClaim(localStorage.getItem(CLAIM_KEY));
  } catch {
    // storage blocked; nothing is hidden
    return null;
  }
}

function persistClaim(claim: Claim): void {
  try {
    if (claim === null) localStorage.removeItem(CLAIM_KEY);
    else localStorage.setItem(CLAIM_KEY, JSON.stringify(claim));
  } catch {
    // nothing to do; the choice just won't survive a reload
  }
}

// said once and remembered in this browser, like the theme
export function useClaim(): [Claim, (claim: Claim) => void] {
  const [claim, setClaim] = useState<Claim>(storedClaim);
  const update = useCallback((next: Claim) => {
    persistClaim(next);
    setClaim(next);
  }, []);
  return [claim, update];
}
