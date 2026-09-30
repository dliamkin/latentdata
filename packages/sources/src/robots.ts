import type { Fetcher } from './types.ts';

interface Group {
  agents: string[];
  allow: string[];
  disallow: string[];
}

export function parseRobots(text: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    const match = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (match === null) continue;
    const field = (match[1] ?? '').toLowerCase();
    const value = (match[2] ?? '').trim();
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
