import { useCallback, useEffect, useRef, useState } from 'react';

import { withViewTransition } from '../lib/viewTransition.ts';

export const PUBLIC_TABS = ['offers', 'calendar', 'watchlist', 'catalog', 'activity'] as const;
export const ALL_TABS = [...PUBLIC_TABS, 'review'] as const;
export type TabId = (typeof ALL_TABS)[number];

// pages reached only from the footer: never in the tab bar, but linkable like any tab. They are
// a separate union from TabId on purpose, so the exhaustive switches over tabs stay exhaustive.
export const DOC_PAGES = ['architecture', 'privacy'] as const;
export type DocPageId = (typeof DOC_PAGES)[number];

export type Route = TabId | DocPageId;

const ROUTES: readonly string[] = [...ALL_TABS, ...DOC_PAGES];

export function isDocPage(route: Route): route is DocPageId {
  return (DOC_PAGES as readonly string[]).includes(route);
}

export function tabElementId(id: TabId): string {
  return `tab-${id}`;
}

export function panelElementId(id: TabId): string {
  return `panel-${id}`;
}

// an empty hash is the default route; a hash that names a route selects it; anything else is an
// in-page anchor (the skip link's #main) and must leave the route alone, or "Skip to content"
// would navigate away from the page it was meant to skip into
export function routeFromHash(hash: string, current: Route = 'offers'): Route {
  const id = hash.replace(/^#/, '');
  if (id === '') return 'offers';
  return ROUTES.includes(id) ? (id as Route) : current;
}

// the hash is the source of truth so routes are linkable and the back button walks through them;
// `override` wins on the first render (a deep link) and is written back to the hash
export function useHashRoute(override?: Route): [Route, (route: Route) => void] {
  const [route, setRouteState] = useState<Route>(
    () => override ?? routeFromHash(window.location.hash),
  );
  // the route setRoute already switched to, so the hashchange it causes doesn't start a second
  // transition (which would cancel the first)
  const settled = useRef<Route | null>(null);
  // the listener is registered once, so it reads the live route from here rather than closing
  // over a stale one
  const latest = useRef<Route>(route);
  useEffect(() => {
    latest.current = route;
  }, [route]);

  useEffect(() => {
    if (override !== undefined && window.location.hash !== `#${override}`) {
      window.history.replaceState(null, '', `#${override}`);
    }
    const onHashChange = (): void => {
      const next = routeFromHash(window.location.hash, latest.current);
      if (next === latest.current) return;
      if (settled.current === next) {
        settled.current = null;
        setRouteState(next);
        return;
      }
      void withViewTransition('tabs', () => {
        setRouteState(next);
      });
    };
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
    };
    // the override only matters for the first render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the state is set here, inside the transition, rather than waiting for hashchange (which
  // fires later and would miss the snapshot); the listener then sees the same value
  const setRoute = useCallback((next: Route) => {
    void withViewTransition('tabs', () => {
      setRouteState(next);
    });
    if (window.location.hash !== `#${next}`) {
      settled.current = next;
      window.location.hash = next;
    }
  }, []);

  return [route, setRoute];
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
