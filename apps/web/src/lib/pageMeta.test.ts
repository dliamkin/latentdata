import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { snapshot } from '../data/snapshot.ts';
import type { TabId } from '../routing/tabs.ts';
import { pageMeta, useDocumentMeta } from './pageMeta.ts';

const offer = snapshot.offers.find((o) => o.id === 'fx-active-long') ?? null;

describe('pageMeta', () => {
  it('leaves the static head alone on the Offers tab', () => {
    expect(pageMeta('offers', null)).toBeNull();
  });

  it('names the tab', () => {
    expect(pageMeta('calendar', null)?.title).toBe('Calendar · Cert Promo Tracker');
    expect(pageMeta('activity', offer)?.title).toBe('Activity · Cert Promo Tracker');
  });

  it('describes a deep-linked offer', () => {
    expect(pageMeta('offers', offer)).toEqual({
      title: 'Fixture Cloud Architect exam voucher · Cert Promo Tracker',
      description:
        'Fixture Cloud: full exam, Jan 1, 2020 – Dec 31, 2099. Register with a work email.',
    });
  });
});

describe('useDocumentMeta', () => {
  it('writes the title and description and restores them', () => {
    const tag = document.createElement('meta');
    tag.name = 'description';
    document.head.append(tag);

    const initialProps: { tab: TabId } = { tab: 'calendar' };
    const { rerender } = renderHook(
      ({ tab }) => {
        useDocumentMeta(pageMeta(tab, null));
      },
      { initialProps },
    );
    expect(document.title).toBe('Calendar · Cert Promo Tracker');
    expect(tag.content).toMatch(/on a calendar/);

    rerender({ tab: 'offers' });
    expect(document.title).toBe('');
    expect(tag.content).toBe('');
    tag.remove();
  });
});
