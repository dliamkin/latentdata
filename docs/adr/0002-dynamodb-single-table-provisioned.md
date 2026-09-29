# 0002 — DynamoDB single table on provisioned capacity inside the free tier

Status: accepted · 2026-09-29

## Context

The system stores a few dozen offers, a few hundred signals a month, and small amounts of
everything else. It has to cost nothing at rest, never surprise anyone with a bill, and support
a handful of access patterns that are all known up front (brief §6.2).

DynamoDB's always-free allowance is 25 GB of storage and 25 read / 25 write capacity units per
account, but only in **provisioned** mode. On-demand mode has no free tier, and autoscaling can
raise capacity past the free ceiling without asking.

## Decision

One table per stage, `cert-tracker-<stage>`, with generic `PK`/`SK` keys and one secondary index
(`GSI1`, projection ALL). Provisioned at 5/5 on the table and 3/3 on the index, no autoscaling.
An infra test fails if the sum ever exceeds 8/8.

Every entity is a row in that table, told apart by key prefix. Key strings are built only in
`services/pipeline/src/lib/repo/keys.ts`; nothing outside the repo layer spells one out.

Reads are `GetItem` and `Query`. There is no `Scan` anywhere.

`dev` is deployed by hand when needed and destroyed afterwards, because its capacity counts
against the same free allowance as `prod`.

## Consequences

- A throttled write is a design problem to look at, not a dial to turn. There is an alarm on it.
- New access patterns mean thinking about keys first. That is the cost of a single table and
  it is paid in design time, not in money.
- Items carry their domain fields and their storage keys side by side; the repo layer strips
  the keys and validates with the core schema on the way out, so a malformed item fails loudly.
- Point-in-time recovery and deletion protection are on in prod. Both are free at this size.
