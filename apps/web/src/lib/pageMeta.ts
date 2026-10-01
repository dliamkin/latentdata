import { useEffect } from 'react';

import type { Offer, WhatIsFree } from '@cert-tracker/core';

import type { Route } from '../routing/tabs.ts';
import { windowLabel } from './format.ts';

export interface PageMeta {
  title: string;
  description: string;
}

const SITE_NAME = 'LatentData';
// Google cuts snippets off around here; better to end on a word than mid-word
const DESCRIPTION_MAX = 160;

const TAB_META: Record<Exclude<Route, 'offers'>, PageMeta> = {
  calendar: {
    title: `Calendar · ${SITE_NAME}`,
    description:
      'When free and discounted IT certification offers open and close, on a month calendar, so you can book the exam before the window ends.',
  },
  watchlist: {
    title: `Watch list · ${SITE_NAME}`,
    description:
      'Recurring IT certification promotions between windows, and offers still waiting on verification, with when the next window is expected.',
  },
  catalog: {
    title: `Certifications · ${SITE_NAME}`,
    description:
      'The most in-demand software and IT certifications with their list prices, and which ones a free or discounted offer covers right now.',
  },
  activity: {
    title: `Activity · ${SITE_NAME}`,
    description:
      'New, changed and expired IT certification offers, newest first, as the tracker finds and verifies them.',
  },
  review: {
    title: `Review · ${SITE_NAME}`,
    description: 'Candidate offers waiting for review.',
  },
  architecture: {
    title: `Architecture · ${SITE_NAME}`,
    description:
      'How the tracker finds a certification promotion, checks it against the vendor page and publishes it: the pipeline, the data model and the cost guards.',
  },
  privacy: {
    title: `Privacy · ${SITE_NAME}`,
    description:
      'What LatentData stores in your browser and what it sends anywhere. No cookies, no analytics, no accounts, and nothing leaves your device.',
  },
};

const WHAT_IS_FREE_PHRASE: Record<WhatIsFree, string> = {
  'full-exam': 'Free exam voucher',
  partial: 'Exam discount',
  'training-and-badge': 'Free training and badge',
  'training-only': 'Free training',
};

export function clip(text: string, max = DESCRIPTION_MAX): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > 0 ? cut.slice(0, space) : cut).replace(/[s,.;:–-]+$/, '')}…`;
}

// null means the static head in index.html already says the right thing
export function pageMeta(route: Route, offer: Offer | null): PageMeta | null {
  if (route !== 'offers') return TAB_META[route];
  if (offer === null) return null;
  const phrase = WHAT_IS_FREE_PHRASE[offer.whatIsFree];
  const dates = windowLabel(offer.windowStart, offer.windowEnd);
  return {
    title: `${offer.name} · ${SITE_NAME}`,
    description: clip(`${phrase} from ${offer.vendor}. ${dates}. ${offer.requirements}`),
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
