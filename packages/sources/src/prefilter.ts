// the cheap gate in front of the LLM: a signal has to mention something we care about and
// nothing we know is noise. Plain substring matching, case-insensitive, no stemming.
export function passesPrefilter(
  text: string,
  include: readonly string[],
  exclude: readonly string[],
): boolean {
  const haystack = text.toLowerCase();
  const hit = (keywords: readonly string[]): boolean =>
    keywords.some((keyword) => keyword !== '' && haystack.includes(keyword.toLowerCase()));
  return hit(include) && !hit(exclude);
}
