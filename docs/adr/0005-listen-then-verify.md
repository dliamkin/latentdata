# 0005 — Listen to many cheap sources, verify the few that matter

Status: accepted · 2026-09-30

## Context

Promotions appear in odd places: a vendor blog, a partner portal, a Reddit thread, a commit to
a community list, a sentence added to a Pearson VUE page. None of these announce themselves in
a machine-readable way. Reading every page with a model on every poll would cost more than the
whole project is worth and would still miss the ones that appear on pages nobody thought to
watch.

## Decision

Discovery is three stages, each one cheaper and noisier than the next, each feeding a queue.

1. **Poll** (hourly, no model). Every enabled source has an adapter: RSS/Atom, Reddit's JSON
   listing, GitHub commits, or a page diff. Adapters run four at a time behind a per-host
   politeness limit, respect `robots.txt` for page diffs, and send conditional requests.
   Each item becomes a signal with a fingerprint of its normalised URL and title; a signal
   seen before is dropped without a write. New signals go through a keyword prefilter and only
   the survivors are queued for triage. A source that fails three polls in a row raises a
   `source.unhealthy` event; ten in a row disables it. A `429` puts the source on cooldown.
2. **Triage** (small model, batches of ten). The model reads title, URL and a 2000-character
   excerpt and answers, per signal, with a structured verdict: relevant or not, a confidence
   and a one-line reason. Signals at or above 0.6 confidence are queued for verification; the
   rest are marked `rejected` and kept, so the decision can be audited and the eval set grown.
3. **Verify** (larger model, one signal at a time). The signal's linked page is fetched, the
   model extracts the offer fields against the `Candidate` schema, and if the page never says
   when or for whom, one bounded web search fills in notes before a second extraction. The
   result becomes a candidate for review. A candidate is **auto-accepted** as an unverified
   offer only when the model is highly confident, the source URL is on the vendor's own domain,
   and nothing already exists under the same slug or match. Everything else waits for a human
   in M4.

Fixtures recorded from the real sources sit under `fixtures/sources/` so the adapters are
tested against what the sites actually return, not against what I hoped they return.

## Consequences

- The model bill scales with the number of new signals, not with the number of sources or
  polls. Most polls cost nothing.
- Recall is bounded by the source list. A promotion on a page nobody registered is invisible
  until someone adds the source; the seed research is what makes the list worth anything.
- Auto-accept trades a little precision for latency on the cleanest case: the vendor
  announcing on its own site. Wrong auto-accepts are visible on the dashboard as `unverified`
  and are cheap to remove.
- Sites change and feeds die. Four of the seeded feeds were already gone when the adapters were
  written; the unhealthy counter and the `SourcesUnhealthy` alarm exist because that will keep
  happening.
