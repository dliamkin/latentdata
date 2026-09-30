import { XMLParser } from 'fast-xml-parser';

import { stripHtml } from './text.ts';
import { SourceError, clip, type SignalItem } from './types.ts';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  cdataPropName: '#cdata',
  // Atom entries carry several <link rel=...>; an RSS <link> is one string and must stay one
  isArray: (name, jpath) =>
    name === 'item' || name === 'entry' || (name === 'link' && jpath === 'feed.entry.link'),
});

type Node = Record<string, unknown>;

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

// fast-xml-parser gives a string, a {#text, #cdata, @_attrs} object, or nothing
function text(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (typeof value === 'object' && value !== null) {
    const node = value as Node;
    return [node['#cdata'], node['#text']]
      .filter((part) => typeof part === 'string')
      .join('')
      .trim();
  }
  return '';
}

function isoDate(value: string): string | null {
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

function atomLink(entry: Node): string {
  const links = asArray(entry.link);
  const alternate = links.find((link) => {
    const rel = (link as Node)['@_rel'];
    return rel === undefined || rel === 'alternate';
  });
  const href = (alternate as Node | undefined)?.['@_href'];
  return typeof href === 'string' ? href : '';
}

function rssItem(item: Node): SignalItem | null {
  const url = text(item.link) || text(item.guid);
  if (!/^https?:\/\//.test(url)) return null;
  return {
    url,
    title: stripHtml(text(item.title)),
    excerpt: clip(stripHtml(text(item['content:encoded']) || text(item.description))),
    publishedAt: isoDate(text(item.pubDate) || text(item['dc:date'])),
  };
}

function atomEntry(entry: Node): SignalItem | null {
  const url = atomLink(entry);
  if (!/^https?:\/\//.test(url)) return null;
  return {
    url,
    title: stripHtml(text(entry.title)),
    excerpt: clip(stripHtml(text(entry.content) || text(entry.summary))),
    publishedAt: isoDate(text(entry.published) || text(entry.updated)),
  };
}

// RSS 2.0 and Atom, which between them cover every feed in the seed
export function parseFeed(xml: string): SignalItem[] {
  let document: unknown;
  try {
    document = parser.parse(xml);
  } catch (error) {
    throw new SourceError('parse', `feed is not well-formed XML: ${String(error)}`);
  }
  const root = (document ?? {}) as Node;
  const channel = (root.rss as Node | undefined)?.channel as Node | undefined;
  if (channel !== undefined) {
    return asArray(channel.item)
      .map((item) => rssItem(item as Node))
      .filter((item): item is SignalItem => item !== null);
  }
  const feed = root.feed as Node | undefined;
  if (feed !== undefined) {
    return asArray(feed.entry)
      .map((entry) => atomEntry(entry as Node))
      .filter((item): item is SignalItem => item !== null);
  }
  throw new SourceError('parse', 'neither an RSS channel nor an Atom feed');
}
