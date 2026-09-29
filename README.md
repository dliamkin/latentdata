# Cert Promo Tracker

Finds free (or partially free) IT certification promotions shortly after they appear online,
records them, publishes a static dashboard and notifies subscribers.

Status: repository bootstrap (M0). Nothing runs yet beyond the toolchain.

## Layout

```
packages/core     domain: schemas, types, status derivation, ids, dedupe, snapshot shape
docs/adr          architecture decision records
scripts/ci        helpers used only by the workflows
```

Further workspaces (`apps/web`, `packages/sources`, `services/pipeline`, `infra`) arrive with
the milestones that need them. Packages export TypeScript source; consumers bundle it.

## Local development

```
nvm use            # Node 24, see .nvmrc
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

`npm run check` runs all four in order. CI runs the same commands, plus actionlint and gitleaks.

## Decisions

See `docs/adr/`. Start with [0001](docs/adr/0001-monorepo-with-a-shared-core-package.md).
