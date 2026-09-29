import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  loadTracking,
  saveTracking,
  serializeTracking,
  upsertEntry,
  type TrackStatus,
  type TrackingStore,
} from './tracking.ts';
import { TrackingContext, type TrackingValue } from './trackingContext.ts';

export function TrackingProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<TrackingStore>(loadTracking);

  useEffect(() => {
    saveTracking(store);
  }, [store]);

  const setStatus = useCallback((offerId: string, status: TrackStatus | null) => {
    setStore((current) => upsertEntry(current, offerId, { status }));
  }, []);

  const setNotes = useCallback((offerId: string, notes: string) => {
    setStore((current) => upsertEntry(current, offerId, { notes }));
  }, []);

  const replaceAll = useCallback((next: TrackingStore) => {
    setStore(next);
  }, []);

  const exportJson = useCallback(() => serializeTracking(store), [store]);

  const value = useMemo<TrackingValue>(
    () => ({ entries: store.entries, setStatus, setNotes, replaceAll, exportJson }),
    [store.entries, setStatus, setNotes, replaceAll, exportJson],
  );

  return <TrackingContext.Provider value={value}>{children}</TrackingContext.Provider>;
}
