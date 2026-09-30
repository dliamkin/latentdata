import type { Source } from '@cert-tracker/core';

import { githubCommitsAdapter } from './adapters/github-commits.ts';
import { pageDiffAdapter } from './adapters/page-diff.ts';
import { redditAdapter } from './adapters/reddit.ts';
import { rssAdapter } from './adapters/rss.ts';
import type { SourceAdapter } from './types.ts';

export { parseFeed } from './feed.ts';
export { passesPrefilter } from './prefilter.ts';
export { checkRobots, robotsAllows } from './robots.ts';
export { lineDiff, pageLines, stripHtml } from './text.ts';
export * from './types.ts';
export { githubCommitsAdapter, pageDiffAdapter, redditAdapter, rssAdapter };

// json-api is reserved in the schema and has no adapter yet; poll skips such sources
export const ADAPTERS: Readonly<Record<Source['kind'], SourceAdapter | null>> = {
  rss: rssAdapter,
  reddit: redditAdapter,
  'github-commits': githubCommitsAdapter,
  'page-diff': pageDiffAdapter,
  'json-api': null,
};

export function adapterFor(kind: Source['kind']): SourceAdapter | null {
  return ADAPTERS[kind];
}
