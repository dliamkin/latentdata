import type { Fetcher } from './types.ts';

interface Group {
  agents: string[];
  allow: string[];
  disallow: string[];
}

export function parseRobots(text: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  // indexOf rather than regexes: the file is untrusted and `.*$` style patterns backtrack
  // polynomially on a line full of the same character
  for (const raw of text.split('\n')) {
    const hash = raw.indexOf('#');
    const line = (hash === -1 ? raw : raw.slice(0, hash)).trim();
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    if (!/^[a-z-]+$/.test(field)) continue;
    const value = line.slice(colon + 1).trim();
    if (field === 'user-agent') {
      if (current === null || current.allow.length + current.disallow.length > 0) {
        current = { agents: [], allow: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (current !== null && field === 'disallow') {
      if (value !== '') current.disallow.push(value);
    } else if (current !== null && field === 'allow') {
      if (value !== '') current.allow.push(value);
    }
  }
  return groups;
}

// the group for our agent if there is one, else the wildcard group; longest matching rule wins
export function robotsAllows(robotsTxt: string, agent: string, path: string): boolean {
  const groups = parseRobots(robotsTxt);
  const ours = groups.find((g) =>
    g.agents.some((a) => a !== '*' && agent.toLowerCase().includes(a)),
  );
  const group = ours ?? groups.find((g) => g.agents.includes('*'));
  if (group === undefined) return true;
  const longest = (rules: string[]): number =>
    rules.filter((rule) => path.startsWith(rule)).reduce((n, rule) => Math.max(n, rule.length), -1);
  const allow = longest(group.allow);
  const disallow = longest(group.disallow);
  return disallow === -1 || allow >= disallow;
}

export async function checkRobots(http: Fetcher, url: string, agent: string): Promise<boolean> {
  const target = new URL(url);
  const response = await http.get(`${target.origin}/robots.txt`, { maxBytes: 100_000 });
  // no robots.txt, or one we can't read, means no rules
  if (response.status >= 400) return true;
  return robotsAllows(response.text, agent, target.pathname);
}
