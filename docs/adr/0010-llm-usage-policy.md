# 0010 — How the pipeline is allowed to use a language model

Status: accepted · 2026-09-30

## Context

The model is the only part of the system whose output cannot be typed at compile time and the
only part with a per-call price. Both problems get worse quietly: a prompt drifts, a schema
loosens, a retry loop runs all night. The rules below exist so that neither can happen
without a code change and a review.

## Decision

- **Structured outputs, always.** Every call that feeds the pipeline goes through
  `messages.parse` with a zod schema as the output format. The SDK validates the reply; a
  reply that does not fit the schema is a typed failure, never a string to be regexed. The one
  plain-text call is the web search, because structured outputs and search citations cannot be
  combined in one request; its text is only ever an _input_ to the next structured extraction.
- **Prompts are files with a version.** `services/pipeline/src/prompts/*.md` carry front
  matter (`version`, `modelClass`) and are bundled into the Lambda as text. The version is
  recorded on every signal and candidate the model touched, so a bad prompt release can be
  found and its output re-run. Changing a prompt is a pull request with a diff, like code.
- **Model ids and prices are configuration, not code.** They live in SSM
  (`/llm/triageModel`, `/llm/verifyModel`, `/llm/pricing`) and are read once per cold start.
  The handlers only know a _class_: triage uses the small class, verify the larger one.
- **A budget guard sits in front of every call.** The daily spend is one DynamoDB item with an
  atomic `ADD`. Before a call the guard checks the day's total against `/llm/dailyCapUsd`;
  after it, the usage is priced and added. When the cap is hit the signal is _deferred_, not
  dropped: it is parked on a sparse index and the next day's first poll re-queues it. A
  `budget.exceeded` event fires once per day and the `LlmCostUsd` alarm mirrors the cap.
- **Prompt caching where it is free to use.** The system prompt of each call is marked
  ephemeral so the repeated part is billed at the cache-read rate.
- **Bounded search.** The verify stage may issue at most one web search per signal, with at
  most three tool uses inside it, and only when the extraction came back without dates or
  eligibility.
- **An eval set is the regression test.** `fixtures/eval/triage.jsonl` holds labelled signals
  drawn from the seed research plus hard negatives (exam dumps, job posts, course sales,
  "passed my exam" threads, cookie-banner diffs). `npm run eval:triage` runs the real model
  over it and prints precision, recall and cost. It is run by hand before a prompt or model
  change is merged and its numbers go into the pull request; it never runs in CI because it
  spends money.
- **Nothing the model says is trusted past its schema.** Extracted URLs are re-validated,
  vendor domains are checked against the core allow-list before auto-accept, and page bodies
  are never logged.

## Consequences

- Swapping the model is an SSM write and an eval run, not a deploy.
- The worst case for a runaway is one day's cap, and the alarm says so the same day.
- The eval set has to be fed. Every triage verdict is stored with its reason so that
  mislabelled or surprising cases can be promoted into the file.
- Server-side refusal fallbacks are not enabled. A refusal is a typed failure that lands in
  the dead-letter queue, which is where I want to see it for now.
