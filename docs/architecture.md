# Architecture

```
                 GitHub (public repo)                              Cloudflare
  ┌─────────────────────────────────────────┐            ┌────────────────────────────┐
  │ apps/web  ── build ──▶ Cloudflare Pages ◀┼── deploy ──┤  static site + PWA          │
  │ apps/web/src/data/snapshot.json ◀────┐   │            │  latentdata.org             │
  └──────────────────────────────────────┼───┘            │  api.latentdata.org (proxy) │
                                         │                └──────────────┬─────────────┘
                              commit via GitHub App                      │ HTTPS
                                         │                               ▼
  ┌──────────────────────────────────────┼─────────────── AWS (single region) ──────────────────────────┐
  │                                      │                                                              │
  │   EventBridge Scheduler ──▶ poll ─▶ SQS triage ─▶ triage ─▶ SQS verify ─▶ verify ─┐                 │
  │   (every 60 min)             │        (LLM: Haiku)             (LLM: Sonnet, fetch) │                 │
  │                              ▼                                                     ▼                 │
  │                        DynamoDB single table  ◀─────────── api (HTTP API + Lambda) ◀── admin UI      │
  │                        offers · candidates · signals · sources · events · subs                        │
  │                              │ Streams (outbox, one consumer)                                        │
  │                              ▼                                                                       │
  │                           outbox ──▶ SNS events topic ──┬─▶ SQS ──▶ notify ──▶ ntfy · Web Push · SES │
  │                                    (filter policies)    └─▶ SQS ──▶ publish ─┐                       │
  │   Scheduler (daily) ────────▶ status  (expiry, expiring-soon, liveness)      │                       │
  │   Scheduler (15 min) ───────▶ publish ─────────────────────────────────────┴─▶ snapshot.json commit  │
  │   Scheduler (daily 13:00) ──▶ digest                                          ─▶ Pages rebuild       │
  │   CloudWatch: logs · ≤10 custom metrics · dashboard · alarms ─▶ SNS email                             │
  └──────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## What exists today

| Piece                                   | State |
| --------------------------------------- | ----- |
| Static site, snapshot validation        | live  |
| Table, events topic, queues, shared DLQ | M2    |
| `publish`, `status`                     | M2    |
| `poll`, `triage`, `verify`              | live  |
| Admin API and review UI                 | M4    |
| `outbox`, `notify`, `digest`            | M5    |

## How data moves

1. **Something changes an offer.** Today that is the seed importer or the daily `status` job;
   later it is also an admin approving a candidate. Every change is one DynamoDB transaction:
   the event, an idempotency guard for that event, the entity write, and a touch of
   `META#system.lastChangeAt`. Either all four happen or none do.
2. **The publisher notices.** Every 15 minutes, or at once for a new offer or an opening
   window, `publish` compares `lastChangeAt` with `lastPublishedAt`. If there is something new
   it builds the snapshot, checks it against what is already published, and commits it.
3. **The site rebuilds.** Cloudflare Pages sees the commit, validates the snapshot against the
   same schema the publisher used, and builds. Visitors get static files.

## Rules the code holds itself to

- **The database is the truth, the snapshot is a view.** Nothing reads the snapshot back as data.
- **Status is derived, not stored.** `deriveStatus()` in `packages/core` decides from the dates;
  the stored status is a hint for the undated cases and an index key.
- **Every write that must not repeat carries an idempotency key** and a condition expression.
  Every Lambda invocation is assumed to be retried.
- **Every external call goes through an adapter** with a timeout, bounded retries with jitter
  and a typed error. Nothing retries forever.
- **Everything that can cost money fails closed.** Provisioned capacity with no autoscaling, a
  commit cap, two budgets, ten metrics, and an alarm on each guard.

Decisions and their reasons are in [adr/](adr/).
