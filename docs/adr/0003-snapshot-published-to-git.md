# 0003 — The site is static; the snapshot is published to git

Status: accepted · 2026-09-29

## Context

Visitors only read. The data changes a few times a day at most. An API in front of the database
would add latency, cost, an attack surface, and a way for the site to be down.

## Decision

DynamoDB is the system of record. A Lambda (`publish`) reads it, builds one JSON document
(`Snapshot`, validated by the core schema), and commits it to
`apps/web/src/data/snapshot.json` on `main`. The commit triggers a Cloudflare Pages build. The
site imports the file at build time and never talks to AWS.

The publisher:

- holds a 120-second lease so two runs can't commit at once;
- does nothing unless `lastChangeAt` is newer than `lastPublishedAt`;
- compares its snapshot with the published file, ignoring `generatedAt` and the job
  timestamps, and skips the commit when nothing a visitor would see has changed;
- commits at most once per 15 minutes on the schedule, immediately for urgent events, and
  never more than 200 times a month.

The file lives under `src/`, not `public/`, because Vite refuses imports from `public/` and the
build-time schema validation is the whole point: a bad snapshot fails the build instead of
shipping.

## Consequences

- The site keeps working when AWS doesn't. The worst case is stale data, and the page says how
  old its data is.
- Publishing latency is a build, about two minutes. Acceptable for offers that last days.
- The repository history doubles as an audit log of what the site showed and when.
- Nobody edits the snapshot by hand. `data-guard.yml` fails any pull request that touches it.
- The 200-commit cap fails closed: the publisher stops and an alarm fires at 150.
