# 0006 — CDK in TypeScript, deployed through GitHub OIDC

Status: accepted · 2026-09-29

## Context

The infrastructure is small but has many parts that must agree with each other and with the
code: queue names, table keys, IAM grants, schedules. It should be reviewable in a pull request
and deployable without anyone holding a long-lived AWS key.

## Decision

AWS CDK v2 in TypeScript, one app, one stack per stage (`CertTracker-<stage>`), constructs
split by concern under `infra/lib/constructs/`. The app runs as TypeScript directly on Node 24;
there is no compile step. Lambdas are bundled by esbuild through `NodejsFunction`, SDK included.

Anything that differs between stages comes from `stageSettings()` or `infra/config/<stage>.json`.
Account ids and email addresses never appear in the repository: the account and region come
from the deployer's environment, the alert address from a GitHub variable.

A second stack, `CertTrackerGithubOidc`, is deployed once by hand. It creates the GitHub OIDC
provider and two roles:

- `deploy`, trusted only for `repo:<owner>/<repo>:environment:prod`. A job that declares
  `environment: prod` presents that subject, so there is no branch condition to get wrong.
- `readonly`, trusted only for `repo:<owner>/<repo>:pull_request`, for `cdk diff`.

Both roles can do almost nothing themselves. They assume the roles `cdk bootstrap` created,
which is where the real permissions live.

## Consequences

- No AWS access keys exist, in GitHub or anywhere else. Humans use IAM Identity Center.
- A pull request that touches infrastructure gets its `cdk diff` posted as a comment.
- A merge to `main` deploys, after the `prod` environment's required reviewer approves.
- Snapshot commits change none of the paths that trigger a deploy.
- Assertion tests in `infra/test/` hold the lines that matter: free-tier capacity, no
  wildcard resources, arm64 on nodejs24.x, a dead-letter queue behind everything.
