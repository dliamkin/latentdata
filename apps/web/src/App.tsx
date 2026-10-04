import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';

import { PrimeReactProvider } from 'primereact/api';

import type { Track } from '@cert-tracker/core';

import { AnnouncerProvider } from './a11y/Announcer.tsx';
import { SkipLink } from './a11y/SkipLink.tsx';
import { AdminProvider } from './admin/AdminProvider.tsx';
import { useAdmin } from './admin/adminContext.ts';
import { Banner } from './components/Banner.tsx';
import { OffersTable } from './components/OffersTable.tsx';
import { SummaryStrip, type StripSelection } from './components/SummaryStrip.tsx';
import { TabBar, TabPanel, type TabSpec } from './components/TabBar.tsx';
import { SiteFooter } from './components/SiteFooter.tsx';
import { TopBar } from './components/TopBar.tsx';
import { UpdatePrompt } from './components/UpdatePrompt.tsx';
import { useClaim } from './data/claim.ts';
import {
  freeNow,
  matchesAudience,
  matchesClaim,
  matchesQuickFilter,
  summarize,
  type QuickFilter,
} from './data/offers.ts';
import {
  useCatalog,
  useEvents,
  useGeneratedAt,
  useNewOfferIds,
  useOffers,
} from './data/useOffers.ts';
import { pageMeta, useDocumentMeta } from './lib/pageMeta.ts';
import {
  ALL_TABS,
  PUBLIC_TABS,
  isDocPage,
  offerIdFromSearch,
  useHashRoute,
  writeOfferParam,
  type TabId,
} from './routing/tabs.ts';
import { useTheme } from './theme/useTheme.ts';
import { TrackingProvider } from './tracking/TrackingProvider.tsx';

// everything outside the default tab is loaded when first shown; PrimeReact's Calendar and
// Dialog alone are a fifth of the bundle
const CalendarView = lazy(() =>
  import('./components/CalendarView.tsx').then((m) => ({ default: m.CalendarView })),
);
const WatchList = lazy(() =>
  import('./components/WatchList.tsx').then((m) => ({ default: m.WatchList })),
);
const CatalogView = lazy(() =>
  import('./components/CatalogView.tsx').then((m) => ({ default: m.CatalogView })),
);
const ActivityFeed = lazy(() =>
  import('./components/ActivityFeed.tsx').then((m) => ({ default: m.ActivityFeed })),
);
const AboutDialog = lazy(() =>
  import('./components/AboutDialog.tsx').then((m) => ({ default: m.AboutDialog })),
);
const AdminDialog = lazy(() =>
  import('./admin/AdminDialog.tsx').then((m) => ({ default: m.AdminDialog })),
);
const AdminPanel = lazy(() => import('./admin/AdminPanel.tsx'));
// the footer pages: diagrams and prose, never part of the first paint
const ArchitecturePage = lazy(() => import('./pages/ArchitecturePage.tsx'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage.tsx'));

interface Reveal {
  id: string;
  seq: number;
}

const loading = <p className="empty-state">Loading…</p>;

function Shell() {
  const allRows = useOffers();
  const events = useEvents();
  const newIds = useNewOfferIds();
  const generatedAt = useGeneratedAt();
  const { mode, toggle } = useTheme();
  const { active: adminActive, dialogMounted } = useAdmin();
  const [reveal, setReveal] = useState<Reveal | null>(() => {
    const id = offerIdFromSearch(window.location.search);
    return id === null ? null : { id, seq: 0 };
  });
  // a deep link always lands on the Offers tab, whatever the hash says
  const [route, setRoute] = useHashRoute(reveal === null ? undefined : 'offers');
  // the tab bar only ever shows a tab; on a doc page it is not rendered at all
  const docPage = isDocPage(route) ? route : null;
  const tab: TabId = docPage === null ? (route as TabId) : 'offers';
  const setTab = setRoute;
  // the Review tab goes when the session does — expiry, a 401, or a reload on #review
  useEffect(() => {
    if (!adminActive && tab === 'review') setTab('offers');
  }, [adminActive, tab, setTab]);
  const [selection, setSelection] = useState<StripSelection>(null);
  // the audience lens: every tab below shows one track's offers, or all of them
  const [audience, setAudience] = useState<Track | null>(null);
  // who the visitor says they are: offers they cannot claim are hidden on every tab
  const [claim, setClaim] = useClaim();
  const [aboutOpen, setAboutOpen] = useState(false);
  const [aboutMounted, setAboutMounted] = useState(false);
  // the Offers table portals its search box into the tab row; state, not a ref, so the table
  // re-renders once the slot exists
  const [toolbarSlot, setToolbarSlot] = useState<HTMLElement | null>(null);

  // the top bar turns into a compact sticky strip once the page has scrolled
  useEffect(() => {
    const update = (): void => {
      document.documentElement.toggleAttribute('data-scrolled', window.scrollY > 8);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => {
      window.removeEventListener('scroll', update);
      document.documentElement.removeAttribute('data-scrolled');
    };
  }, []);

  // a revealed offer is shown whoever the visitor is: a link to it must not land on nothing
  const revealId = reveal?.id ?? null;
  const claimable = useMemo(
    () => allRows.filter((row) => row.id === revealId || matchesClaim(row, claim)),
    [allRows, claim, revealId],
  );
  const rows = useMemo(
    () => claimable.filter((row) => matchesAudience(row, audience)),
    [claimable, audience],
  );
  const free = useMemo(() => freeNow(rows), [rows]);
  const catalog = useCatalog(rows);
  const catalogRows = useMemo(
    () => catalog.filter((row) => matchesAudience(row, audience)),
    [catalog, audience],
  );
  const audienceCounts = useMemo(
    () => ({
      all: claimable.length,
      software: claimable.filter((row) => matchesAudience(row, 'software')).length,
      it: claimable.filter((row) => matchesAudience(row, 'it')).length,
    }),
    [claimable],
  );
  const counts = useMemo(() => summarize(rows, newIds), [rows, newIds]);
  const quickFilter: QuickFilter | null = selection === 'watchlist' ? null : selection;
  const offerCount = useMemo(
    () =>
      rows.filter(
        (row) => row.derivedStatus !== 'expired' && matchesQuickFilter(row, quickFilter, newIds),
      ).length,
    [rows, quickFilter, newIds],
  );
  const tabs = useMemo((): TabSpec[] => {
    const ids: readonly TabId[] = adminActive ? ALL_TABS : PUBLIC_TABS;
    return ids.map((id) => {
      switch (id) {
        case 'offers':
          return { id, label: 'Offers', count: offerCount };
        case 'calendar':
          return { id, label: 'Calendar' };
        case 'watchlist':
          return { id, label: 'Watch list', count: counts.watch };
        case 'catalog':
          return { id, label: 'Certifications', count: catalogRows.length };
        case 'activity':
          return { id, label: 'Activity' };
        case 'review':
          return { id, label: 'Review', badge: 'Admin' };
      }
    });
  }, [adminActive, offerCount, counts.watch, catalogRows.length]);
  const revealedOffer = reveal === null ? null : (rows.find((row) => row.id === reveal.id) ?? null);
  useDocumentMeta(pageMeta(route, revealedOffer), docPage === null ? counts.expiring : 0);

  const revealOffer = useCallback(
    (offerId: string) => {
      setSelection(null);
      // a reveal must not land on a row the lens would hide
      setAudience(null);
      writeOfferParam(offerId);
      setReveal((current) => ({ id: offerId, seq: (current?.seq ?? 0) + 1 }));
      setTab('offers');
    },
    [setTab],
  );

  const onSelect = (next: StripSelection): void => {
    setSelection(next);
    setTab(next === 'watchlist' ? 'watchlist' : 'offers');
  };

  return (
    <div className="app">
      <SkipLink />
      <TopBar
        generatedAt={generatedAt}
        mode={mode}
        onToggleTheme={toggle}
        onAbout={() => {
          setAboutMounted(true);
          setAboutOpen(true);
        }}
      />
      <main id="main" tabIndex={-1}>
        {docPage !== null ? (
          <div className="content">
            <Suspense fallback={loading}>
              {docPage === 'architecture' ? <ArchitecturePage /> : <PrivacyPage />}
            </Suspense>
          </div>
        ) : (
          <>
            <Banner freeNow={free} />
            <SummaryStrip
              counts={counts}
              selected={selection}
              onSelect={onSelect}
              audience={audience}
              audienceCounts={audienceCounts}
              onAudience={setAudience}
              claim={claim}
              claimHidden={allRows.length - claimable.length}
              onClaim={setClaim}
            />
            <div className="content">
              <TabBar
                tabs={tabs}
                active={tab}
                onChange={setTab}
                slot={
                  tab === 'offers' ? (
                    <div ref={setToolbarSlot} className="toolbar-slot" />
                  ) : undefined
                }
              />
              <TabPanel id="offers" active={tab}>
                <OffersTable
                  key={reveal?.seq ?? -1}
                  rows={rows}
                  quickFilter={quickFilter}
                  newIds={newIds}
                  initialReveal={reveal?.id ?? null}
                  toolbarSlot={toolbarSlot}
                  onClearQuickFilter={() => {
                    setSelection(null);
                  }}
                />
              </TabPanel>
              <TabPanel id="calendar" active={tab}>
                <Suspense fallback={loading}>
                  <CalendarView rows={rows} onReveal={revealOffer} />
                </Suspense>
              </TabPanel>
              <TabPanel id="watchlist" active={tab}>
                <Suspense fallback={loading}>
                  <WatchList rows={rows} onReveal={revealOffer} />
                </Suspense>
              </TabPanel>
              <TabPanel id="catalog" active={tab}>
                <Suspense fallback={loading}>
                  <CatalogView rows={catalogRows} onReveal={revealOffer} />
                </Suspense>
              </TabPanel>
              <TabPanel id="activity" active={tab}>
                <Suspense fallback={loading}>
                  <ActivityFeed events={events} onReveal={revealOffer} />
                </Suspense>
              </TabPanel>
              {adminActive && (
                <TabPanel id="review" active={tab}>
                  <Suspense fallback={loading}>
                    <AdminPanel
                      onLeave={() => {
                        setTab('offers');
                      }}
                    />
                  </Suspense>
                </TabPanel>
              )}
            </div>
          </>
        )}
      </main>
      <SiteFooter onNavigate={setRoute} />
      {dialogMounted && (
        <Suspense fallback={null}>
          <AdminDialog />
        </Suspense>
      )}
      {aboutMounted && (
        <Suspense fallback={null}>
          <AboutDialog
            visible={aboutOpen}
            onHide={() => {
              setAboutOpen(false);
            }}
            generatedAt={generatedAt}
            offerCount={rows.length}
            mode={mode}
          />
        </Suspense>
      )}
      <UpdatePrompt />
    </div>
  );
}

export default function App() {
  return (
    <PrimeReactProvider value={{ ripple: false }}>
      <AnnouncerProvider>
        <TrackingProvider>
          <AdminProvider>
            <Shell />
          </AdminProvider>
        </TrackingProvider>
      </AnnouncerProvider>
    </PrimeReactProvider>
  );
}
