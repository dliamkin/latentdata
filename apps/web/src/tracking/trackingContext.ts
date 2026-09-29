import { createContext, useContext } from 'react';

import type { TrackStatus, TrackingEntry, TrackingStore } from './tracking.ts';

export interface TrackingValue {
  entries: Readonly<Record<string, TrackingEntry>>;
  setStatus: (offerId: string, status: TrackStatus | null) => void;
  setNotes: (offerId: string, notes: string) => void;
  replaceAll: (store: TrackingStore) => void;
  exportJson: () => string;
}

export const TrackingContext = createContext<TrackingValue | null>(null);

export function useTracking(): TrackingValue {
  const value = useContext(TrackingContext);
  if (value === null) throw new Error('useTracking needs a TrackingProvider');
  return value;
}
