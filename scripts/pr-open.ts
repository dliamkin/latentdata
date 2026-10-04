import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { repoRoot } from './lib/paths.ts';
import { branchCommits, currentBranch, draftPath, git, parseDraft } from './lib/pr.ts';

// npm run pr:open -- [--base main] [--dry-run]
// Pushes the branch and opens its PR with the title and description from .git/pr/<branch>.md, or
// updates the PR if one is already open. This is the step to use instead of the "Create a pull
// request" link git prints after a push: that link only ever shows the empty template. It refuses
// while a section still holds the template's hint comment, so a PR cannot go up unwritten.
const { values } = parseArgs({
  options: {
    base: { type: 'string', default: 'main' },
    'dry-run': { type: 'boolean', default: false },
  },
});

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const base = values.base;
const dryRun = values['dry-run'];
const branch = currentBranch();
if (branch === base || branch === 'HEAD')
  fail(`check out the branch to open a PR for, not ${branch}`);

const path = draftPath(branch);
if (!existsSync(path)) fail(`no description for ${branch} at ${path}; start one: npm run pr:draft`);
const draft =
  parseDraft(readFileSync(path, 'utf8')) ??
  fail(`${path} must start with the PR title as a heading: "# feat(web): ..."`);
if (draft.unwritten.length > 0) {
  fail(`still the template's hint in: ${draft.unwritten.join(', ')}. Write them in ${path}`);
}

const { subjects, carried } = branchCommits(`origin/${base}`);
if (subjects.length === 0) fail(`no commits on ${branch} that origin/${base} does not have`);
if (carried > 0) {
  fail(
    `${String(carried)} commit(s) on ${branch} are already on origin/${base} under another sha; the PR would show them again. Drop them first: git rebase origin/${base}`,
  );
}

const run = (command: string, args: string[], input?: string): string =>
  execFileSync(command, args, { encoding: 'utf8', cwd: repoRoot, input }).trim();

const remoteRef = `refs/remotes/origin/${branch}`;
const pushed =
  git('for-each-ref', '--format=%(objectname)', remoteRef) === git('rev-parse', 'HEAD');
const open = JSON.parse(
  run('gh', ['pr', 'list', '--head', branch, '--state', 'open', '--json', 'number,url']),
) as { number: number; url: string }[];
const existing = open[0];

console.log(`title  ${draft.title}`);
console.log(`body   ${path}`);
console.log(`push   ${pushed ? 'already up to date' : `git push -u origin ${branch}`}`);
console.log(
  `pr     ${existing === undefined ? `new, into ${base}` : `update #${String(existing.number)}`}`,
);
if (dryRun) process.exit(0);

// a plain push, never a forced one: a branch rewritten after it was pushed stops here
if (!pushed)
  execFileSync('git', ['push', '-u', 'origin', branch], { cwd: repoRoot, stdio: 'inherit' });

// the body goes in on stdin so the title line of the draft never reaches the description
const content = ['--title', draft.title, '--body-file', '-'];
if (existing === undefined) {
  const created = run(
    'gh',
    ['pr', 'create', '--base', base, '--head', branch, ...content],
    draft.body,
  );
  console.log(`\n${created}`);
} else {
  run('gh', ['pr', 'edit', String(existing.number), ...content], draft.body);
  console.log(`\nupdated ${existing.url}`);
}
