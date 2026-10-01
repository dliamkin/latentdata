import { useEffect } from 'react';

import type { Offer } from '@cert-tracker/core';

import type { TabId } from '../routing/tabs.ts';
import { windowLabel } from './format.ts';
import { WHAT_IS_FREE_TAGS } from './labels.ts';

export interface PageMeta {
  title: string;
  description: string;
}

const SITE_NAME = 'Cert Promo Tracker';

const TAB_META: Record<Exclude<TabId, 'offers'>, PageMeta> = {
  calendar: {
    title: `Calendar · ${SITE_NAME}`,
    description:
      'Start and end dates of free and discounted IT certification promotions, laid out on a calendar.',
  },
  watchlist: {
    title: `Watch list · ${SITE_NAME}`,
    description:
      'Recurring IT certification promotions that are between windows, with when the next one is expected.',
  },
  catalog: {
    title: `Certifications · ${SITE_NAME}`,
    description:
      'The certifications most asked for in software and IT, with their list price and whether a free or discounted offer covers one right now.',
  },
  activity: {
    title: `Activity · ${SITE_NAME}`,
    description: 'Recently added, changed and expired IT certification promotions, newest first.',
  },
  review: {
    title: `Review · ${SITE_NAME}`,
    description: 'Candidate offers waiting for review.',
  },
};

// null means the static head in index.html already says the right thing
export function pageMeta(tab: TabId, offer: Offer | null): PageMeta | null {
  if (tab !== 'offers') return TAB_META[tab];
  if (offer === null) return null;
  const what = WHAT_IS_FREE_TAGS[offer.whatIsFree].label.toLowerCase();
  return {
    title: `${offer.name} · ${SITE_NAME}`,
    description: `${offer.vendor}: ${what}, ${windowLabel(offer.windowStart, offer.windowEnd)}. ${offer.requirements}`,
  };
}

function descriptionTag(): HTMLMetaElement | null {
  return document.head.querySelector('meta[name="description"]');
}

// read at load so going back to the Offers tab restores exactly what the static head shipped with
const initial: PageMeta = {
  title: document.title,
  description: descriptionTag()?.content ?? '',
};

// `badge` is the number of offers ending soon; a pinned tab reads "(2) …" at a glance
export function useDocumentMeta(meta: PageMeta | null, badge = 0): void {
  const { title, description } = meta ?? initial;
  useEffect(() => {
    document.title = badge > 0 ? `(${String(badge)}) ${title}` : title;
    descriptionTag()?.setAttribute('content', description);
  }, [title, description, badge]);
}
