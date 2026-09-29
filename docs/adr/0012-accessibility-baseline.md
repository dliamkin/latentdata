# 0012 — Accessibility baseline and how it is enforced

Status: accepted · 2026-09-29

## Context

The site is public and will be used by people on screen readers, keyboards only, phones and
high zoom. Accessibility that is checked once and then drifts is worse than none, because it
creates false confidence.

## Decision

Target WCAG 2.2 AA. In the code:

- Landmarks: one `<header>`, one `<main>`, a `<nav aria-label="Summary filters">`; a "Skip to
  content" link is the first focusable element. The tab strip is PrimeReact's `role="tablist"`
  inside `<main>` rather than a second `<nav>`, so there is exactly one navigation landmark.
- Every status, eligibility and weight tag has text and an icon. Colour never carries meaning
  alone.
- One polite live region (`AnnouncerProvider`) announces filter results, saves and errors.
- Focus is managed on route-like changes: dialogs move focus in and restore it on close (PrimeReact
  does this), a deep-linked row receives focus after it is revealed.
- Contrast is fixed at the theme level (ADR-0009), never per component.
- `prefers-reduced-motion` turns animation off. Layout holds at 320px and at 200% zoom.

Enforced in CI, every PR:

- `eslint-plugin-jsx-a11y` strict on the web app.
- `vitest-axe` in component tests (`toHaveNoViolations`).
- `@axe-core/playwright` on every public tab in both themes, an expanded row and the admin
  dialog: zero serious or critical violations.
- Lighthouse CI: accessibility ≥ 95, performance ≥ 90, best practices ≥ 95, measured with the
  desktop profile. On the mobile profile (slow 4G, 4x CPU slowdown) the page scores 0.76 on
  performance at the time of writing; the payload is React, the PrimeReact table and zod, all of
  which the design requires. The known route to a mobile 0.9 is `zod/mini` in `packages/core`
  (about 30 KB gzipped) and pre-rendering the Offers tab at build time. Neither is done yet.

## Consequences

- A failing a11y check is fixed in the component, never by weakening the rule or the budget.
- New views need a component test with an axe check and a line in `a11y.spec.ts`.
- jsdom cannot evaluate colour contrast, so contrast is only truly checked by the Playwright
  run; component tests cover structure and names.
