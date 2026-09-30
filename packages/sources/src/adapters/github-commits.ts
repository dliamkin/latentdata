import { conditionalHeaders, validators } from '../conditional.ts';
import { passesPrefilter } from '../prefilter.ts';
import { SourceError, clip, type SignalItem, type SourceAdapter } from '../types.ts';

const PER_PAGE = 30;

interface CommitSummary {
  sha: string;
  html_url: string;
  commit: { message: string; author?: { date?: string } | null };
}

interface CommitDetail {
  files?: { filename: string }[];
}

function isCommitSummary(value: unknown): value is CommitSummary {
  const v = value as Partial<CommitSummary> | null;
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof v.sha === 'string' &&
    typeof v.html_url === 'string' &&
    typeof v.commit?.message === 'string'
  );
}

function parseJson(text: string, what: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new SourceError('parse', `${what} is not JSON`);
  }
}

// one signal per new commit: the message, plus the changed file names when the message already
// looks relevant, because the file list is a second request we don't want to spend on noise
export const githubCommitsAdapter: SourceAdapter = {
  kind: 'github-commits',
  async fetch(source, { http, githubToken }) {
    const headers: Record<string, string> = {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(githubToken === undefined ? {} : { authorization: `Bearer ${githubToken}` }),
    };
    const separator = source.url.includes('?') ? '&' : '?';
    const response = await http.get(`${source.url}${separator}per_page=${String(PER_PAGE)}`, {
      ...conditionalHeaders(source.state),
      headers,
    });
    if (response.notModified) return { items: [], state: {} };
    if (response.status >= 400) {
      throw new SourceError('http', `github returned ${String(response.status)}`, response.status);
    }
    const commits = parseJson(response.text, 'commit list');
    if (!Array.isArray(commits)) throw new SourceError('parse', 'commit list is not an array');

    const items: SignalItem[] = [];
    for (const commit of commits) {
      if (!isCommitSummary(commit)) continue;
      const message = commit.commit.message.trim();
      let excerpt = message;
      if (passesPrefilter(message, source.keywordsInclude, source.keywordsExclude)) {
        const detail = await http.get(`${source.url}/${commit.sha}`, { headers });
        if (detail.status < 400) {
          const files = (parseJson(detail.text, 'commit detail') as CommitDetail).files ?? [];
          if (files.length > 0) {
            excerpt += `\n\nFiles: ${files.map((file) => file.filename).join(', ')}`;
          }
        }
      }
      const date = commit.commit.author?.date;
      items.push({
        url: commit.html_url,
        title: message.split('\n')[0] ?? '',
        excerpt: clip(excerpt),
        publishedAt: date === undefined ? null : new Date(date).toISOString(),
      });
    }
    return { items, state: validators(response) };
  },
};
