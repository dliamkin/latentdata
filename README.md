# Cert Promo Tracker

Finds free (or partially free) IT certification promotions shortly after they appear online,
records them, publishes a static dashboard and notifies subscribers.

Live: https://latentdata.org

Status: M3. The dashboard is live on top of a DynamoDB table, a publisher commits the site's
data, and the discovery pipeline runs on its own: an hourly poll over twenty sources, a small
model that triages what is new, a larger one that verifies and extracts, and a daily spending
cap in front of both. Review tooling for the candidates it produces arrives in M4.

How the parts fit: [docs/architecture.md](docs/architecture.md).

## Layout

```
apps/web            Vite + React + PrimeReact dashboard (PWA)
packages/core       domain: zod schemas, types, status derivation, ids, dedupe, snapshot shape
services/pipeline   Lambda handlers and their libraries: repo layer, adapters, snapshot
infra               AWS CDK app: one stack per stage, plus the one-time GitHub OIDC stack
scripts             local tooling: seed import, snapshot and schema generation, icons
seed                the offers and sources the system started from
fixtures/web        a small stable snapshot the e2e tests build against
docs/adr            architecture decision records
docs/runbooks       how to do the manual things
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

`npm run check` also synthesizes the CDK app, which bundles every Lambda. None of it needs an
AWS account.

## Where the data comes from

DynamoDB is the system of record. The publish Lambda builds `apps/web/src/data/snapshot.json`
from it and commits the file to `main`; Cloudflare Pages rebuilds the site on that commit.
Never edit the file by hand: a pull request that touches it is refused. Data changes go through
the admin UI.

Offer status is never stored as truth. `deriveStatus()` in `packages/core` recomputes it from
the window dates on every render and in the daily status job, so the site and the notifications
can't disagree.

Without AWS, a snapshot can still be produced from the seed:

```
npm run snapshot:local      # seed/offers.seed.json -> apps/web/src/data/snapshot.json
```

## Deploying

| What            | How                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------- |
| The site        | Cloudflare Pages builds `main` on push. [Runbook](docs/runbooks/cloudflare-pages.md)      |
| AWS, first time | [docs/runbooks/aws-bootstrap.md](docs/runbooks/aws-bootstrap.md)                          |
| AWS, after that | merging to `main` runs `infra-deploy`, which waits for approval                           |
| A dev stack     | `npm run cdk -- deploy CertTracker-dev -c stage=dev -c alertEmail=<you>`, then destroy it |

A pull request that touches `infra/`, `services/` or `packages/` gets its `cdk diff` posted as
a comment.

## Cost

Everything on AWS sits inside the always-free allowances: provisioned DynamoDB capacity with no
autoscaling, ten custom metrics, under ten alarms, two budgets. The only expected spend is the
LLM from M3 on, capped per day in the app and per month in the provider's console.

## Decisions

See `docs/adr/`.
