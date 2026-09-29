import { useCallback, useEffect, useState } from 'react';

export const PUBLIC_TABS = ['offers', 'calendar', 'watchlist', 'activity'] as const;
export const ALL_TABS = [...PUBLIC_TABS, 'review'] as const;
export type TabId = (typeof ALL_TABS)[number];

export function tabFromHash(hash: string): TabId {
  const id = hash.replace(/^#/, '');
  return (ALL_TABS as readonly string[]).includes(id) ? (id as TabId) : 'offers';
}

// the hash is the source of truth so tabs are linkable and the back button walks through them;
// `override` wins on the first render (a deep link) and is written back to the hash
export function useHashTab(override?: TabId): [TabId, (tab: TabId) => void] {
  const [tab, setTabState] = useState<TabId>(() => override ?? tabFromHash(window.location.hash));

  useEffect(() => {
    if (override !== undefined && window.location.hash !== `#${override}`) {
      window.history.replaceState(null, '', `#${override}`);
    }
    const onHashChange = (): void => {
      setTabState(tabFromHash(window.location.hash));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
    };
    // the override only matters for the first render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTab = useCallback((next: TabId) => {
    if (window.location.hash === `#${next}`) {
      setTabState(next);
    } else {
      window.location.hash = next;
    }
  }, []);

  return [tab, setTab];
}

export function offerIdFromSearch(search: string): string | null {
  const id = new URLSearchParams(search).get('offer');
  return id !== null && id !== '' ? id : null;
}

export function writeOfferParam(offerId: string | null): void {
  const url = new URL(window.location.href);
  if (offerId === null) url.searchParams.delete('offer');
  else url.searchParams.set('offer', offerId);
  window.history.replaceState(null, '', url);
}
