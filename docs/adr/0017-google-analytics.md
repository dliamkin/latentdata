# 17. Google Analytics on the site

Status: Accepted (2026-11-05)

## Context

The site has been live for a month with no measurement at all, and the privacy page promised
none: no cookies, no analytics, nothing sent anywhere. It also undertook to say so before any
usage measurement shipped. The owner now wants to know whether anyone uses the site, which tabs
they open and which offers they follow, and has a Google Analytics 4 property for it.

Two things made this more than pasting Google's snippet into `index.html`:

- Every build of the page would carry the tag: the dev server, the e2e build that Playwright and
  Lighthouse run against, the owner's local builds. Each would count as a visit, and the property
  would need filters to undo it (GA4 filters by IP address, not by hostname).
- The privacy page would be false in six places, and its meta description in one.

## Decision

**Google Analytics 4, with Google's own snippet, unchanged.** Cloudflare Web Analytics, free on
the account and cookieless, was the alternative. It counts page loads and little else, while the
questions here (which tabs, which outbound offers, how many come back) are ones GA4 answers out
of the box. The price is a script from Google and two cookies on every visit, and the privacy
page says so.

**The tag is added at build time by a Vite plugin, not written into `index.html`.** `analytics()`
in `vite.config.ts` injects the two script tags into the head on `transformIndexHtml`, and only
when `command === 'build'` and the ID is not empty. So:

- `vite` (the dev server) never has it.
- The e2e build sets `VITE_GA_MEASUREMENT_ID` to nothing in `playwright.config.ts`, so Playwright,
  axe and Lighthouse run against a page without it.
- A `vite build` with no override, which is what Cloudflare Pages runs, gets the site's ID: a
  constant in `vite.config.ts` next to `SITE_URL`. Nothing needs setting in the Pages dashboard.

The variable is read with `loadEnv`, so a `.env` copied from `.env.example`, where it is empty,
turns the tag off for local builds as well. The plugin refuses anything that is not a `G-` ID, so
a typo fails the build rather than shipping a dead tag. A committed `.env.production` would have
done the same job, but `.gitignore` excludes `.env.*` on purpose and a constant is easier to find.

**The privacy page tells the truth about it.** The two cookies (`_ga`, `_ga_EKTCZ42NYH`) join
the table beside the localStorage keys. "What leaves your device" lists what Google receives.
Google joins Cloudflare under "Who else is necessarily involved", with the link to Google's
partner-sites page that its terms require. The opt-out add-on is named. The paragraphs that said
"nothing is sent" and "no click is reported" are rewritten, because enhanced measurement records
outbound clicks. The meta description changes with it. The page describes a GA4 property at its
defaults, enhanced measurement on and two months of event retention, because that is how a new
property comes.

**No consent prompt, for now.** The tag ships as Google supplies it. A consent prompt, or
Google's Consent Mode with storage denied until the visitor agrees, is a separate decision with
its own UI, and is left open below rather than made here by default.

## Consequences

- The "no analytics, no cookies" promise is withdrawn. The page's git history shows when, as the
  page said it would.
- Every visit loads a script from Google and sets two first-party cookies for two years. The
  Lighthouse budget in CI does not see that cost, because it runs against the e2e build; a run
  against the published site does.
- The privacy page is only true while the property stays at its defaults. Turning enhanced
  measurement off, changing retention, or switching on Google signals or advertising features
  changes what is collected, and the page has to follow.
- Preview deployments (`*.pages.dev`) are production builds and report into the same property.
  Their hostname tells them apart in reports.
- Open: EU and UK rules treat analytics cookies as needing consent before they are set, and the
  site has visitors there. Consent Mode (`gtag('consent', 'default', …)`) or a banner closes that
  gap and is the next decision.
