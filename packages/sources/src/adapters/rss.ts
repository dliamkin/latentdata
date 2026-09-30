import { conditionalHeaders, validators } from '../conditional.ts';
import { parseFeed } from '../feed.ts';
import { SourceError, type SourceAdapter } from '../types.ts';

export const rssAdapter: SourceAdapter = {
  kind: 'rss',
  async fetch(source, { http }) {
    const response = await http.get(source.url, {
      ...conditionalHeaders(source.state),
      headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
    });
    if (response.notModified) return { items: [], state: {} };
    if (response.status >= 400) {
      throw new SourceError('http', `feed returned ${String(response.status)}`, response.status);
    }
    return { items: parseFeed(response.text), state: validators(response) };
  },
};
