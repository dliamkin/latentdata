import { createHash } from 'node:crypto';

import { conditionalHeaders, validators } from '../conditional.ts';
import { checkRobots } from '../robots.ts';
import { lineDiff, pageLines } from '../text.ts';
import { SourceError, clip, type SourceAdapter } from '../types.ts';

export const PAGE_TEXT_MAX = 8000;
const ROBOTS_TTL_MS = 24 * 3_600_000;
export const USER_AGENT_NAME = 'cert-tracker';

function hash(lines: readonly string[]): string {
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

// one signal when a page's text changes; the excerpt is what changed, not the page. The first
// poll only records a baseline, so a new source never fires on day one.
export const pageDiffAdapter: SourceAdapter = {
  kind: 'page-diff',
  async fetch(source, { http, now }) {
    const { state } = source;
    const robotsFresh =
      state.robotsCheckedAt !== undefined &&
      now.getTime() - Date.parse(state.robotsCheckedAt) < ROBOTS_TTL_MS;
    const allowed = robotsFresh
      ? (state.robotsAllowed ?? true)
      : await checkRobots(http, source.url, USER_AGENT_NAME);
    const robotsState = robotsFresh
      ? {}
      : { robotsAllowed: allowed, robotsCheckedAt: now.toISOString() };
    if (!allowed) return { items: [], state: robotsState };

    const response = await http.get(source.url, conditionalHeaders(state));
    if (response.notModified) return { items: [], state: robotsState };
    if (response.status >= 400) {
      throw new SourceError('http', `page returned ${String(response.status)}`, response.status);
    }

    const lines = pageLines(response.text);
    const contentHash = hash(lines);
    const nextState = {
      ...robotsState,
      ...validators(response),
      contentHash,
      pageText: clip(lines.join('\n'), PAGE_TEXT_MAX),
    };
    if (contentHash === state.contentHash || state.pageText === undefined) {
      return { items: [], state: nextState };
    }
    const diff = lineDiff(state.pageText.split('\n'), lines);
    if (diff === '') return { items: [], state: nextState };
    return {
      items: [
        {
          url: source.url,
          title: `Page changed: ${source.url}`,
          excerpt: clip(diff),
          publishedAt: now.toISOString(),
        },
      ],
      state: nextState,
    };
  },
};
