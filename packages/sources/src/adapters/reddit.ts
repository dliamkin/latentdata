import { conditionalHeaders, validators } from '../conditional.ts';
import { parseFeed } from '../feed.ts';
import { SourceError, type SourceAdapter } from '../types.ts';

// reddit's new.rss is Atom. It may refuse cloud egress outright; a 403 or 429 here is a signal
// to back off and count a failure, never to try harder.
export const redditAdapter: SourceAdapter = {
  kind: 'reddit',
  async fetch(source, { http }) {
    const response = await http.get(source.url, {
      ...conditionalHeaders(source.state),
      headers: { accept: 'application/atom+xml, application/xml' },
    });
    if (response.notModified) return { items: [], state: {} };
    if (response.status === 403 || response.status === 429) {
      throw new SourceError(
        'blocked',
        `reddit answered ${String(response.status)}`,
        response.status,
      );
    }
    if (response.status >= 400) {
      throw new SourceError('http', `reddit answered ${String(response.status)}`, response.status);
    }
    return { items: parseFeed(response.text), state: validators(response) };
  },
};
