import { describe, expect, it } from 'vitest';

import {
  TRACKING_KEY,
  emptyStore,
  isTrackStatus,
  loadTracking,
  parseTracking,
  saveTracking,
  serializeTracking,
  upsertEntry,
} from './tracking.ts';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => {
      map.clear();
    },
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => {
      map.delete(k);
    },
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}

describe('tracking store', () => {
  it('round-trips through storage', () => {
    const storage = memoryStorage();
    const store = upsertEntry(emptyStore(), 'a', { status: 'applied', notes: 'hi' });
    expect(saveTracking(store, storage)).toBe(true);
    expect(loadTracking(storage)).toEqual(store);
  });

  it('returns an empty store when storage is missing or corrupt', () => {
    expect(loadTracking(null)).toEqual(emptyStore());
    const storage = memoryStorage();
    storage.setItem(TRACKING_KEY, '{not json');
    expect(loadTracking(storage)).toEqual(emptyStore());
    storage.setItem(TRACKING_KEY, JSON.stringify({ version: 2, entries: {} }));
    expect(loadTracking(storage)).toEqual(emptyStore());
  });

  it('survives a storage that throws', () => {
    const throwing = memoryStorage();
    throwing.setItem = () => {
      throw new Error('quota');
    };
    expect(saveTracking(emptyStore(), throwing)).toBe(false);
  });

  it('drops an entry once it has no status and no notes', () => {
    let store = upsertEntry(emptyStore(), 'a', { status: 'earned' });
    expect(store.entries.a?.status).toBe('earned');
    store = upsertEntry(store, 'a', { status: null });
    expect(store.entries.a).toBeUndefined();
    store = upsertEntry(store, 'a', { notes: 'keep' });
    expect(store.entries.a?.notes).toBe('keep');
  });

  it('serialises and parses an export', () => {
    const store = upsertEntry(emptyStore(), 'a', { status: 'in-progress' }, new Date(0));
    const text = serializeTracking(store);
    expect(parseTracking(text)).toEqual(store);
    expect(() => parseTracking('{"version":1,"entries":{"a":{"status":"nope"}}}')).toThrow();
  });

  it('narrows status values', () => {
    expect(isTrackStatus('earned')).toBe(true);
    expect(isTrackStatus('done')).toBe(false);
    expect(isTrackStatus(null)).toBe(false);
  });
});
