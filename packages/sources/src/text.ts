const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith('#x')) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(Number(entity.slice(1)));
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

const RAW_TEXT = new Set(['script', 'style', 'noscript', 'svg', 'template']);
const CHROME = new Set([...RAW_TEXT, 'nav', 'header', 'footer', 'iframe']);
const BLOCKS = new Set(
  'p div li h1 h2 h3 h4 h5 h6 tr br section article header footer blockquote pre dd dt td th'.split(
    ' ',
  ),
);
const NONE: ReadonlySet<string> = new Set();

function isNameChar(c: string): boolean {
  return (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9');
}

// one pass, no regex: the markup is untrusted, and a page made of nothing but `<script` or
// `<<<<` sends `<[^>]+>` style patterns quadratic. Elements in `skip` are dropped with their
// contents, elements in `blocks` become line breaks, every other tag becomes a space.
function stripTags(html: string, skip: ReadonlySet<string>, blocks: ReadonlySet<string>): string {
  const lower = html.toLowerCase();
  let out = '';
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, lt);
    if (lower.startsWith('<!--', lt)) {
      const end = lower.indexOf('-->', lt + 4);
      out += ' ';
      if (end === -1) break;
      i = end + 3;
      continue;
    }
    const closing = html[lt + 1] === '/';
    let j = lt + (closing ? 2 : 1);
    while (j < lower.length && isNameChar(lower[j] ?? '')) j += 1;
    const name = lower.slice(lt + (closing ? 2 : 1), j);
    const gt = html.indexOf('>', j);
    if (gt === -1) {
      out += html.slice(lt);
      break;
    }
    out += blocks.has(name) ? '\n' : ' ';
    i = gt + 1;
    if (!closing && skip.has(name)) {
      const end = lower.indexOf(`</${name}`, i);
      if (end === -1) break;
      const endGt = html.indexOf('>', end);
      i = endGt === -1 ? html.length : endGt + 1;
    }
  }
  return out;
}

// markup to plain text, good enough for an excerpt: no layout, no attributes, no scripts
export function stripHtml(html: string): string {
  return decodeEntities(stripTags(html, RAW_TEXT, NONE))
    .replace(/\s+/g, ' ')
    .trim();
}

// found by index, not by a `<body>(.*)</body>` capture: greedy, it has to backtrack from the
// end of the page to the closing tag, quadratic in the worst case
function bodyOf(html: string): string {
  const open = html.search(/<body[\s>]/i);
  if (open === -1) return html;
  const start = html.indexOf('>', open);
  if (start === -1) return html;
  const close = html.toLowerCase().lastIndexOf('</body>');
  if (close === -1 || close < start) return html;
  return html.slice(start + 1, close);
}

// a page as lines of text, one per block element, with the chrome removed; what page-diff
// hashes and diffs
export function pageLines(html: string): string[] {
  return decodeEntities(stripTags(bodyOf(html), CHROME, BLOCKS))
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);
}

// what changed between two texts, line by line, in the order the new page has them
export function lineDiff(previous: readonly string[], next: readonly string[]): string {
  const before = new Set(previous);
  const after = new Set(next);
  const added = next.filter((line) => !before.has(line)).map((line) => `+ ${line}`);
  const removed = previous.filter((line) => !after.has(line)).map((line) => `- ${line}`);
  return [...added, ...removed].join('\n');
}
