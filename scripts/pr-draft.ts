import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

import { repoRoot } from './lib/paths.ts';
import { branchCommits, currentBranch, draftPath } from './lib/pr.ts';

// npm run pr:draft -- [--base origin/main] [--force]
// Starts this branch's PR description at .git/pr/<branch>.md: a suggested title on the first line
// and the template with the commit list already filled in. `npm run pr:open` opens the PR from
// that file. GitHub only derives a title and body from commits when the branch holds exactly
// one, and `gh pr create --fill` ignores the template, so neither does what this repo wants: the
// template's prose sections, with the mechanical part written for you.
const { values } = parseArgs({
  options: {
    base: { type: 'string', default: 'origin/main' },
    force: { type: 'boolean', default: false },
  },
});

const base = values.base;
const branch = currentBranch();
const { subjects, carried } = branchCommits(base);

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

const path = draftPath(branch);
// a draft that exists may already hold written prose; never wipe it by accident
if (existsSync(path) && !values.force) {
  console.error(`${path} already exists; edit it, or pass --force to start it again`);
  process.exit(1);
}
mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, `# ${subjects[0] ?? branch}\n\n${body}`);

console.log(`${String(subjects.length)} commit(s) on ${branch} since ${base} -> ${path}`);
if (carried > 0) {
  console.log(
    `${String(carried)} commit(s) are already on ${base} under another sha; rebase to drop them: git rebase ${base}`,
  );
}
console.log('\nWrite the Why, Decisions and Manual steps. The first line is the PR title: it is');
console.log('only the first commit, so rewrite it when the branch does more than that one thing.');
console.log('\nThen: npm run pr:open');
