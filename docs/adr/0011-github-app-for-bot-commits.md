# 0011 — A GitHub App commits the snapshot, not a personal access token

Status: accepted · 2026-09-29

## Context

The publisher has to push to `main`, which is protected by a ruleset that requires a pull
request and passing checks. Something needs permission to skip those rules for one file.

A personal access token would work, but it acts as a person: it carries that person's access to
every repository they can reach, it expires on a date someone has to remember, and its commits
are indistinguishable from theirs.

## Decision

A GitHub App owned by the repository owner, installed on this repository only, with a single
permission: Contents, read and write. Its id, installation id and private key live in SSM
Parameter Store as SecureStrings. The publisher exchanges them for an installation token
(`@octokit/auth-app`) that lasts an hour.

The App is a bypass actor on the `main` ruleset with mode "always". A ruleset is used rather
than classic branch protection because classic protection's bypass only waives the pull request
requirement and would still reject the push for missing status checks.

## Consequences

- Bot commits are attributed to the App, so `git log --author` separates them from human work.
- The blast radius of a leaked key is one repository's contents, and rotating it is a runbook
  step that touches nothing else.
- The publisher's IAM policy names the three parameters exactly. No other function can read them.
- CI ignores the snapshot path on push, so publisher commits don't burn build minutes or
  trigger a deploy.
