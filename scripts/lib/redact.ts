// Recorded pages carry the keys a browser needs to run them: Google's AIza... client keys, chat
// widget tokens. They are public by construction, but they look like secrets to every scanner,
// so they are replaced with same-length placeholders before the file is written.
const PATTERNS: readonly RegExp[] = [
  /AIza[0-9A-Za-z_-]{35}/g,
  /("(?:[a-zA-Z]*[tT]oken|apiKey|api_key)":")([^"]{8,})(")/g,
];

export function redactPublicKeys(text: string): string {
  return PATTERNS.reduce(
    (acc, pattern) =>
      acc.replace(pattern, (match: string, ...groups: unknown[]) => {
        if (typeof groups[0] === 'string' && typeof groups[1] === 'string') {
          return `${groups[0]}${'x'.repeat(groups[1].length)}${String(groups[2])}`;
        }
        return 'x'.repeat(match.length);
      }),
    text,
  );
}
