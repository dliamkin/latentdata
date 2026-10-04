import { execFileSync } from 'node:child_process';

import { repoRoot } from './paths.ts';

export const git = (...args: string[]): string =>
  execFileSync('git', args, { encoding: 'utf8', cwd: repoRoot }).trim();

export const currentBranch = (): string => git('rev-parse', '--abbrev-ref', 'HEAD');

// One draft per branch, so a description written for one branch can never open another's PR.
// .git is a file in a worktree, so ask git where the real directory is.
export const draftPath = (branch: string): string =>
  `${git('rev-parse', '--absolute-git-dir')}/pr/${branch}.md`;

export interface BranchCommits {
  subjects: string[];
  // commits the base already has under another sha: what a squash-merged PR leaves behind
  carried: number;
}

export function branchCommits(base: string): BranchCommits {
  const lines = (range: string, ...flags: string[]): string[] =>
    git('log', '--reverse', '--no-merges', '--pretty=%s', ...flags, range)
      .split('\n')
      .filter((line) => line !== '');
  const subjects = lines(`${base}...HEAD`, '--cherry-pick', '--right-only');
  return { subjects, carried: lines(`${base}..HEAD`).length - subjects.length };
}

export interface Draft {
  title: string;
  body: string;
  // sections that still hold the template's hint comment
  unwritten: string[];
}

// A draft is the PR title as a first-line heading, then the template with its sections written.
export function parseDraft(text: string): Draft | null {
  const [first = '', ...rest] = text.replaceAll('\r\n', '\n').split('\n');
  if (!first.startsWith('# ') || first.slice(2).trim() === '') return null;
  const body = rest.join('\n').trim();
  const unwritten = body
    .split(/^## /m)
    .slice(1)
    .filter((section) => section.includes('<!--'))
    .map((section) => section.split('\n', 1)[0] ?? '');
  return { title: first.slice(2).trim(), body: `${body}\n`, unwritten };
}
