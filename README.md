# Cert Promo Tracker

Finds free (or partially free) IT certification promotions shortly after they appear online,
records them, publishes a static dashboard and notifies subscribers.

Live: https://latentdata.org

Status: M1. The domain package and the public dashboard exist; the data still comes from a seed
file. The AWS pipeline that discovers and verifies offers arrives in M2 and M3.

## Layout

```
apps/web          Vite + React + PrimeReact dashboard (PWA)
packages/core     domain: zod schemas, types, status derivation, ids, dedupe, snapshot shape
scripts/          local tooling: snapshot generation, schema generation, icons
seed/             the offers and sources the system started from; imported once in M2
fixtures/web      a small stable snapshot the e2e tests build against
docs/adr          architecture decision records
docs/runbooks     how to do the manual things
```

Packages export TypeScript source; consumers bundle it. See [ADR-0001](docs/adr/0001-monorepo-with-a-shared-core-package.md).

## Local development

```
nvm use                     # Node 24, see .nvmrc
npm ci
npm run dev                 # dashboard on http://localhost:5173
npm run check               # lint, typecheck, unit tests, build; what CI runs
npm run e2e                 # Playwright + axe against a fixture build (needs: npx playwright install chromium,
                            # or PLAYWRIGHT_CHANNEL=chrome to use an installed Chrome)
npm run lhci                # Lighthouse CI budgets against apps/web/dist
```

## Where the data comes from

`apps/web/src/data/snapshot.json` is what the site renders. Until M2 it is produced locally:

```
npm run snapshot:local      # seed/offers.seed.json -> apps/web/src/data/snapshot.json
```

From M2 on, the publish Lambda writes it from DynamoDB and commits it to `main` directly. Never
edit the file by hand; a PR that touches it is refused. Data changes go through the admin UI.

Offer status is never stored as truth. `deriveStatus()` in `packages/core` recomputes it from
the window dates on every render and in the daily status job, so the site and the notifications
can't disagree.

## Deploying the site

Cloudflare Pages builds `main` on push. Setup and checks: [docs/runbooks/cloudflare-pages.md](docs/runbooks/cloudflare-pages.md).

## Decisions

See `docs/adr/`.
