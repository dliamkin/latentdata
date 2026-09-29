import { z } from 'zod';

export const TRACK_STATUSES = ['applied', 'in-progress', 'earned', 'dismissed'] as const;
export type TrackStatus = (typeof TRACK_STATUSES)[number];

const EntrySchema = z.object({
  status: z.enum(TRACK_STATUSES).nullable(),
  notes: z.string(),
  updatedAt: z.iso.datetime(),
});

const StoreSchema = z.object({
  version: z.literal(1),
  entries: z.record(z.string(), EntrySchema),
});

export type TrackingEntry = z.infer<typeof EntrySchema>;
export type TrackingStore = z.infer<typeof StoreSchema>;

export const TRACKING_KEY = 'cert-tracker:tracking:v1';

export function emptyStore(): TrackingStore {
  return { version: 1, entries: {} };
}

export function isTrackStatus(value: unknown): value is TrackStatus {
  return typeof value === 'string' && (TRACK_STATUSES as readonly string[]).includes(value);
}

// localStorage can be absent, blocked or full; tracking is a convenience, so every failure
// degrades to memory-only rather than breaking the page
export function getStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function parseTracking(text: string): TrackingStore {
  return StoreSchema.parse(JSON.parse(text));
}

export function serializeTracking(store: TrackingStore): string {
  return JSON.stringify(store, null, 2);
}

export function loadTracking(storage: Storage | null = getStorage()): TrackingStore {
  try {
    const raw = storage?.getItem(TRACKING_KEY);
    return raw ? parseTracking(raw) : emptyStore();
  } catch {
    return emptyStore();
  }
}

export function saveTracking(
  store: TrackingStore,
  storage: Storage | null = getStorage(),
): boolean {
  try {
    storage?.setItem(TRACKING_KEY, JSON.stringify(store));
    return storage !== null;
  } catch {
    return false;
  }
}

export function upsertEntry(
  store: TrackingStore,
  offerId: string,
  patch: Partial<Pick<TrackingEntry, 'status' | 'notes'>>,
  now: Date = new Date(),
): TrackingStore {
  const current = store.entries[offerId] ?? { status: null, notes: '' };
  const next: TrackingEntry = {
    status: patch.status === undefined ? current.status : patch.status,
    notes: patch.notes ?? current.notes,
    updatedAt: now.toISOString(),
  };
  const kept = Object.entries(store.entries).filter(([id]) => id !== offerId);
  if (next.status !== null || next.notes !== '') kept.push([offerId, next]);
  return { version: 1, entries: Object.fromEntries(kept) };
}
