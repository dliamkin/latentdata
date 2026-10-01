# 13. Audience tracks, technology tags, and a catalog of credentials

Status: Accepted (2026-10-01)

## Context

The tracker was built around one question: which certification promotions are free right now. Two
things it could not express came up in use.

First, an offer's `category` is a single value out of eight, and it mixed two different questions:
what the credential is about (cloud, security, data) and who it is for. A developer looking for a
free C# or React credential had to read every row, because "dev" was one category among eight and
said nothing about language or framework. Someone running systems had the same problem in reverse.

Second, free course certificates were out of scope by accident. `whatIsFree` already had
`training-and-badge` and `training-only`, but the triage prompt rejected "training or badges that
lead to no certification", so freeCodeCamp, Kaggle, Cisco Skills for All and the Google career
certificates never reached a candidate.

Third, the dashboard could only say something about a credential while an offer for it existed. A
reader who wants a Security+ or a PMP and wants to know whether to wait had nothing to look at,
and neither did anyone judging whether the site covers the credentials they care about.

## Decision

Three additions, all to `packages/core` first so the pipeline and the web app share them.

**Tracks.** Every offer and catalog entry carries `tracks: ('software' | 'it')[]`. An offer can
serve both (a cloud architect exam, Git, Kubernetes) or neither (marketing, business
applications), so this is a list and an empty list is a real answer, not a missing one. The web app
turns it into one lens above the summary numbers that narrows every tab at once.

**Technologies.** A closed list of 38 ids (`javascript`, `csharp`, `react`, `terraform`, …),
grouped as languages, frameworks and platforms, on both offers and catalog entries. Closed, because
a free-text list would be spelled three ways by the extraction model within a week and no filter
could be built on it. `category` stays as it is, with `infrastructure` added for networking,
systems and support, which were previously squeezed into `other` or `security`.

**Catalog.** A new entity, `CERT#<id>`, for a credential people ask for, whether or not an offer
covers it today: name, vendor, kind (`exam` or `course`), list price, aliases, and a rank inside its
category. It ships in the snapshot and the web app joins it to the offers in the browser with
`catalogMatch()`, which matches on exam code, on name or alias within the same vendor, and on
vendor-wide offers ("Any AWS Certification exam"). Nothing is stored about the join, so a new offer
lights up its catalog row on the next publish with no migration.

Prices are the one field here that goes stale on its own. They are kept as a number plus a
`priceNote` for the cases a number cannot carry (member pricing, a monthly subscription, "price
based on country"), and `null` when the certifying body does not publish one — which is true for
27 of the 79 seeded entries, including every PMI and CompTIA exam, whose pages refuse an
unattended fetch.

The catalog is the only entity the importer overwrites. Offers and sources are never overwritten,
because the admin API and the pipeline own them after the first import; the catalog has no other
editor than `seed/catalog.seed.json`, so a re-import writes what changed and deletes what the file
dropped.

## Consequences

- Both LLM prompts went to version 2. Triage now accepts free courses that end in a certificate,
  and still rejects courses that cost money, free trials, and training that leads to no credential.
  Verify fills `tracks` and `technologies` from the closed lists. The eval set grew from 45 to 65
  rows, 20 of them about the new scope, so a precision drop from the wider net is visible before a
  prompt ships.
- Offers written before this change carry neither list. Both fields default to `[]` in the schema, so
  old items and old snapshots still parse, and `planTaxonomyBackfill` fills only the rows that have
  nothing — a later edit in the table is never overwritten by a re-import.
- An offer with no track is invisible under both halves of the lens, which is correct for
  marketing, but means a mis-tagged offer hides. The seed test pins the list of untracked offers so
  that choice stays deliberate.
- The catalog's value depends on vendor spellings matching between the two seed files. A test lists
  the catalog vendors that no offer uses yet, so a new offer spelled "Comptia" is caught in CI
  rather than silently failing to light up a row.
- `savingUsd` only claims a saving when an offer makes a priced credential free today. Partial
  discounts are shown as "Discounted now" without a number, because the offer's own text is the
  only place the discount is stated.
