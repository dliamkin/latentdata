# The certification catalog

`seed/catalog.seed.json` is the list of credentials the Certifications tab shows whether or not an
offer covers them. Unlike offers and sources, this file stays the editor: the importer overwrites
what changed and deletes what the file no longer lists.

## Adding or correcting an entry

1. Edit `seed/catalog.seed.json`. Every field is required; the shape is `CatalogEntrySchema` in
   `packages/core/src/schemas.ts`.
2. Check the price on the certifying body's own page, not a reseller or a blog. If the body does
   not publish one figure, use `"listPriceUsd": null` and say why in `priceNote` ("price based on
   country", "member price USD 575"). A wrong number is worse than no number: the tab prints it as
   the saving a free offer is worth.
3. Set `lastVerified` to the day you checked.
4. `rank` orders the entry inside its category, 1 first. Ranks are unique per category and a test
   enforces it, so inserting one means renumbering the ones below it.
5. `aliases` is how an offer finds the entry. Add the short names and exam codes promotions use
   ("Security+", "SY0-701", "SAA"). `vendor` has to be spelled exactly as offers from that vendor
   spell it, which a test in `services/pipeline/src/lib/seed.test.ts` checks.
6. `npm run check`, then import:

```
AWS_PROFILE=cert-tracker npm run seed:import -- --stage prod
```

The run prints how many entries it wrote, removed and left alone, and touches
`META#system.lastChangeAt` only if something changed, so the publisher rebuilds the site on its
next pass.

## Why an offer isn't lighting up a catalog row

`catalogMatch()` in `packages/core/src/catalog.ts` joins the two in the browser. It matches, in
order:

- the entry's `examCode` anywhere in the offer's `certifications` or `examCode` — this one works
  across vendors, so a Microsoft offer listing `GH-300` reaches the GitHub entry;
- the entry's `name` or one of its `aliases`, as whole words, when the vendor strings match;
- a vendor-wide offer ("Any AWS Certification exam") against any `exam` entry of that vendor.

So the usual causes are a vendor spelled differently in the two files, a missing alias, or an
expired offer (expired offers never count as coverage). Unverified offers show the row as
"Unconfirmed offer" rather than free: that is deliberate.

## Removing one

Delete it from the file and re-import. The entry is deleted from the table, and nothing else
refers to it — the join is computed, never stored.
