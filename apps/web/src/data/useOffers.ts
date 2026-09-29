import { useMemo } from 'react';

import type { SnapshotEvent } from '@cert-tracker/core';

import { useToday } from '../lib/today.ts';
import { newOfferIds, toRows, type OfferRow } from './offers.ts';
import { snapshot } from './snapshot.ts';

// the only way components get offers; there is no fetch, the snapshot is in the bundle
export function useOffers(): OfferRow[] {
  const today = useToday();
  return useMemo(() => toRows(snapshot.offers, today), [today]);
}

export function useEvents(): SnapshotEvent[] {
  return useMemo(
    () =>
      [...snapshot.events].sort((a, b) =>
        a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0,
      ),
    [],
  );
}

export function useNewOfferIds(): ReadonlySet<string> {
  const events = useEvents();
  return useMemo(() => newOfferIds(events, new Date()), [events]);
}

export function useGeneratedAt(): string {
  return snapshot.generatedAt;
}
