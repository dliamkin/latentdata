import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { repoRoot } from './lib/paths.ts';

// npm run pr:draft -- [--base origin/main]
// Writes the PR template to .git/PR_BODY.md with the commit list already filled in and prints the
// gh command to open the PR with it. GitHub only derives a title and body from commits when the
// branch holds exactly one, and `gh pr create --fill` ignores the template, so neither does what
// this repo wants: the template's prose sections, with the mechanical part written for you.
const { values } = parseArgs({ options: { base: { type: 'string', default: 'origin/main' } } });

const git = (...args: string[]): string =>
  execFileSync('git', args, { encoding: 'utf8', cwd: repoRoot }).trim();

const base = values.base;
const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
const lines = (range: string, ...flags: string[]): string[] =>
  git('log', '--reverse', '--no-merges', '--pretty=%s', ...flags, range)
    .split('\n')
    .filter((line) => line !== '');

// --cherry-pick drops commits the base already has under another sha, which is what a
// squash-merged PR on this same branch leaves behind
const subjects = lines(`${base}...HEAD`, '--cherry-pick', '--right-only');
const carried = lines(`${base}..HEAD`).length - subjects.length;

if (subjects.length === 0) {
  console.error(`no commits on ${branch} that ${base} does not have; is it pushed and fetched?`);
  process.exit(1);
}

const template = readFileSync(`${repoRoot}.github/PULL_REQUEST_TEMPLATE.md`, 'utf8');
const bullets = subjects.map((subject) => `- ${subject}`).join('\n');
const body = template.replace(
  /## What changed\n\n<!--[\s\S]*?-->/,
  `## What changed\n\n${bullets}`,
);
if (body === template) {
  console.error('the template no longer has a "## What changed" section with a hint comment');
  process.exit(1);
}

// .git is a file in a worktree, so ask git where the real directory is
const path = `${git('rev-parse', '--absolute-git-dir')}/PR_BODY.md`;
writeFileSync(path, body);

const title = subjects[0] ?? branch;
console.log(`${String(subjects.length)} commit(s) on ${branch} since ${base} -> ${path}`);
if (carried > 0) {
  console.log(
    `${String(carried)} commit(s) are already on ${base} under another sha; rebase to drop them: git rebase ${base}`,
  );
}
console.log('\nFill in Why, Decisions and Manual steps. The title below is only the first');
console.log('commit; rewrite it when the branch does more than that one thing:\n');
console.log(`gh pr create --title "${title}" --body-file "${path}"`);
console.log(`\nAlready opened it? gh pr edit --title "${title}" --body-file "${path}"`);
