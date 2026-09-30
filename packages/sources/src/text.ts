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

// markup to plain text, good enough for an excerpt: no layout, no attributes, no scripts
export function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

const BLOCK_TAGS = 'p|div|li|h[1-6]|tr|br|section|article|header|footer|blockquote|pre|dd|dt|td|th';

// a page as lines of text, one per block element, with the chrome removed; what page-diff
// hashes and diffs
export function pageLines(html: string): string[] {
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  const withoutChrome = body
    .replace(
      /<(script|style|noscript|svg|template|nav|header|footer|iframe)\b[\s\S]*?<\/\1>/gi,
      ' ',
    )
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(new RegExp(`</?(${BLOCK_TAGS})\\b[^>]*>`, 'gi'), '\n');
  return decodeEntities(withoutChrome.replace(/<[^>]+>/g, ' '))
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
