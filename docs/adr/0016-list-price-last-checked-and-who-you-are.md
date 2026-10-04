# 16. What an exam normally costs, when a row was checked, and who the visitor is

Status: Accepted (2026-10-04)

## Context

ADR-0015 made a row say what it costs the visitor. Three things a visitor still had to work out
alone:

- **What the offer is worth.** "Free exam" reads the same for a USD 99 exam and a USD 300 one. The
  catalog (ADR-0013) already holds list prices, but only the Certifications tab used them.
- **Whether the row can be trusted.** The banner says every offer is checked against the vendor's
  page. The date of that check was two clicks away, inside the expanded row.
- **Whether they can claim it.** A third of the offers are for students, partners, customers,
  event attendees or aid programmes. Nothing let a visitor put those out of sight.

The Offer column was also the narrowest thing on the row that mattered most: names wrapped to
four lines while Status and Window each held one short line.

## Decision

**List price is read from the catalog, in the browser, never stored on the offer.**
`listPriceOf()` uses the same `catalogMatch()` join as the Certifications tab. Entries the offer
names win; if it names none, the vendor's exams count when the offer is for any of them. A named
credential with no published price gives no figure, even when the vendor's other exams have one.
When the matched prices differ the row shows the range.

The row says "Normally $165" under the cost marker, or "Certificate $99" when only the course is
free. There is no Value column: about a quarter of the offers can be priced today, and a column
of dashes would cost the Offer column its width. Sorting "What's free" instead breaks ties by
price, dearest first.

**The banner adds up what is free today.** `freeNow()` counts offers that are open (active or
evergreen) and cost nothing, and sums their list prices, taking the dearest when an offer covers
any one of several exams. It follows the audience lens and the visitor's answer below, so the
number is theirs.

**"Checked N days ago" sits in the row's meta line**, from `lastVerified`. That field is a date,
so the label counts days, and gives the date itself after 30. An unverified row leaves it out:
its group already says it needs a check.

**Who you are is asked once and kept in the browser.** `cert-tracker:claim:v1` holds a list of
roles. Not set means nothing is hidden. Set, an offer stays if it is open to everyone or to any
role on the list, so "None of these" (the empty list) leaves only public offers. The filter is
applied in the shell, before the audience lens, so every tab and every count agrees. An offer
opened from a link is always shown, whatever the answer, so a shared link cannot land on nothing.

**Status and Window are one column, "When".** The status sits on top and the dates under it. It
sorts by end date and filters by status: the row groups already order by status, so a status
sort did nothing the groups had not done.

## Consequences

- The banner's figure is only as large as the catalog's price coverage. Offers for credentials
  that are not in the catalog, or whose vendor publishes no single price, add to the count and
  not to the sum.
- A stale `lastVerified` is now visible on the row. That is the point, and it makes the re-check
  cadence of the pipeline something a visitor can see.
- The claim key is one more thing in localStorage; the privacy page's table lists it.
- Anything that selected the "Status" or "Window" column header by name now finds "When".
