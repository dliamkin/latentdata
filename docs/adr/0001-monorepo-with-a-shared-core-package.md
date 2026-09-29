# 0001 — Monorepo with npm workspaces and a shared `core` domain package

Status: accepted · 2026-09-29

## Context

The system has a static web app, a handful of Lambda handlers, source adapters, infrastructure
code and CLI scripts. They all agree on what an offer, a candidate and a snapshot look like,
and the status of an offer is derived by the same rule in the browser and in the daily job. If
those definitions live in more than one place they will drift, and a drift here means the site
and the notifications disagree.

## Decision

One repository, npm workspaces, one lockfile. Domain logic lives in `packages/core` and is the
only place a domain type or rule is defined; everything else imports `@cert-tracker/core`.

Workspace packages export TypeScript source (`exports: { ".": "./src/index.ts" }`) rather than
compiled output. Every consumer already runs a bundler (Vite for the site, esbuild for the
Lambdas), so a compile step would only add a stale-`dist` failure mode. Relative imports carry
the `.ts` extension and `erasableSyntaxOnly` is on, so Node 24 can run a script that imports
core directly, without a transpiler.

Type checking is `tsc -b` over project references with `emitDeclarationOnly`; the emitted
declarations are build artefacts, not something anyone imports.

TypeScript is pinned to 6.0.x for now. 7.0 is out but typescript-eslint's type-aware rules cap
at `<6.1`; the pin moves when that ceiling does.

## Consequences

- Adding a workspace means a `tsconfig.json` extending the base, a reference in the root
  `tsconfig.json`, and an entry in `vitest.config.ts` `projects` when it has tests.
- No package is published. Versions stay at `0.0.0`.
- A change to `core` rebuilds every consumer. That is the point.
- Cross-package imports go through package names only; a relative `../../packages/core` import
  bypasses the exports map and is a review failure.
