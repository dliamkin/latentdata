import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { snapshot } from '../data/snapshot.ts';
import type { TabId } from '../routing/tabs.ts';
import { clip, pageMeta, useDocumentMeta } from './pageMeta.ts';

const offer = snapshot.offers.find((o) => o.id === 'fx-active-long') ?? null;

describe('pageMeta', () => {
  it('leaves the static head alone on the Offers tab', () => {
    expect(pageMeta('offers', null)).toBeNull();
  });

  it('names the tab', () => {
    expect(pageMeta('calendar', null)?.title).toBe('Calendar · LatentData');
    expect(pageMeta('activity', offer)?.title).toBe('Activity · LatentData');
  });

  it('describes a deep-linked offer', () => {
    expect(pageMeta('offers', offer)).toEqual({
      title: 'Fixture Cloud Architect exam voucher · LatentData',
      description:
        'Free exam voucher from Fixture Cloud. Jan 1, 2020 – Dec 31, 2099. Register with a work email.',
    });
  });
});

describe('clip', () => {
  it('keeps short text as is', () => {
    expect(clip('Register with a work email.', 40)).toBe('Register with a work email.');
  });

  it('ends long text on a whole word', () => {
    expect(clip('Register with a work email, then book the exam.', 30)).toBe(
      'Register with a work email…',
    );
  });

  it('keeps every tab description inside the limit', () => {
    for (const tab of ['calendar', 'watchlist', 'catalog', 'activity'] as const) {
      expect(pageMeta(tab, null)?.description.length).toBeLessThanOrEqual(160);
    }
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
    expect(document.title).toBe('Calendar · LatentData');
    expect(tag.content).toMatch(/on a month calendar/);

    rerender({ tab: 'offers' });
    expect(document.title).toBe('');
    expect(tag.content).toBe('');
    tag.remove();
  });
});
