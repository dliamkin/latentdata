# 15. A stored "cost to you", and labels a visitor can read at a glance

Status: Accepted (2026-10-03)

## Context

The offers table answered "what is free" with one of four vendor-shaped words (full exam,
partial, training + badge, training only) in plain text, and put the credential's weight in grey
type under the offer name. Two things followed.

A free exam for conference attendees read exactly like a free exam for everyone. Oracle AI World's
"up to 3 free exam attempts" needs a conference pass of about $2,399, and the table said "Full
exam". `whatIsFree` describes the thing on offer; nothing recorded whether money has to change
hands to get it, and it cannot be derived — a free online event and a paid conference are both
`event-attendee`.

And weight, the field that separates an exam employers ask for from a course badge, was stored on
every offer (the pipeline has always extracted high, medium and low) but could not be seen without
reading the small print or sorted at all.

## Decision

**`costToYou`**, a new field on offers and candidates in `packages/core`:

| Value             | Means                                                               | Shown as         |
| ----------------- | ------------------------------------------------------------------- | ---------------- |
| `nothing`         | no money changes hands at any point                                 | 100% free        |
| `purchase-first`  | only after buying something else: a ticket, a subscription, an exam | Purchase needed  |
| `reduced-price`   | a discount; the rest of the fee is still due                        | You pay part     |
| `certificate-fee` | the training is free and the certificate is sold                    | Paid certificate |

It is optional in the schema so items written before it existed still parse, and `costToYouOf()`
fills the gap from `whatIsFree`. That fallback is right for everything except `purchase-first`,
which is the one case the stored field exists for. An invariant keeps the two fields from
contradicting each other (a discount cannot cost nothing).

Where the value comes from: the verify prompt (version 3) extracts it for new offers; every seed
offer states it, and `seed:import` backfills stored offers that lack it without overwriting one
already set; an approved candidate carries it to the offer.

**The table.** "What's free" is now a filled badge in the visitor's words (Free exam, Exam
discount, Course + badge, Course only) with the cost marker under it. This is the one place the
table uses a filled badge — the redesign's rule was icon plus text and no pills, and it still
holds everywhere else — because what you get and what it costs are the first two things a row has
to say. Colour never carries the meaning alone: each badge has its own icon and wording.

"Recognition" is its own sortable column: three bars and the word. A "100% free only" toggle sits
beside the search box, and a collapsed key above the table gives each label one plain sentence.
Sorting the "What's free" column puts what costs nothing first, and an exam before a course
within that.

**Vendor icons.** The site build fetches icons for vendors that have none
(`scripts/vendor-icons.ts --build`), so a vendor approved in the Review tab gets its mark on the
build its own snapshot commit triggers. It runs only on the hosted build, only for missing
vendors, and cannot fail the build.

## Consequences

- An offer nobody classified shows the implied cost, which can only err towards "100% free" for
  an offer that in fact needs a purchase. Reviewing a candidate now shows the cost, so that is the
  moment to catch it.
- The verify prompt changed, so the next eval run should be read against version 3.
- Automatic icons are favicons, and a favicon can be the wrong brand: `cs50.harvard.edu` serves
  the edX mark. Icons under 32px are refused in favour of the monogram, and `BRAND_DOMAINS` in the
  script is where a wrong one is corrected and committed.
- Labels changed wording ("Full exam" is now "Free exam"). Stored values did not, so links,
  filters and the snapshot format are unaffected.
