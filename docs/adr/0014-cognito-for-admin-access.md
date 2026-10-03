# 14. A Cognito user pool for admin access, not a bearer token

Status: Accepted (2026-10-02)

## Context

§7 of the brief planned the admin API's auth as a static bearer token: a SHA-256 hash in SSM at
`/cert-tracker/<stage>/admin/tokenHash`, compared in constant time by a `requireAdmin`
middleware, behind an `Authenticator` interface so a `CognitoJwtAuthenticator` could replace it
later. §12 listed that replacement as a going-public task.

The admin UI shipped before the API did, so the token dialog in `apps/web/src/admin/` accepts
any non-empty string and protects nothing — there is no API for it to authenticate to. Building
M4 meant choosing the boundary for real, and the ordering in the brief turned out to be the wrong
way round: the token design is more code to write _and_ weaker than the thing it was deferring.

A static bearer token for this site means a secret that never expires, with no second factor, no
revocation short of rotating the parameter, and a full copy of it in `sessionStorage` on a public
origin — and a `requireAdmin` middleware of our own to get subtly wrong. The alternatives
considered were an email-and-password store of our own (the most code and the weakest result:
password hashing, reset mail, lockout, sessions, all for one user), and IAM SigV4 with the admin
UI run locally (the smallest attack surface, but no approving a candidate from a phone).

## Decision

A Cognito user pool is the identity, and an HTTP API JWT authorizer is the gate. The
`Authenticator` seam is not built, because there is nothing left for it to abstract: API Gateway
validates the signature, issuer, audience and expiry before the Lambda is invoked at all, so the
amount of auth code in this repository is zero.

`infra/lib/constructs/admin-identity.ts` holds the pool. The settings that matter are the ones
that differ from the CDK or CloudFormation default, because every one of those defaults is looser
than it should be here:

- `selfSignUpEnabled: false`. The one account is created by hand.
- `Mfa.REQUIRED` with TOTP only. SMS is the weaker factor and the only one billed per message.
- `FeaturePlan.LITE`, pinned. Passkeys and threat protection sit above Lite and bill per monthly
  active user. One admin needs neither, and the budget is a dollar.
- `flows: { authorizationCodeGrant: true, implicitCodeGrant: false }`. CDK's default enables the
  implicit grant, which returns tokens in the URL fragment.
- `scopes: [OPENID, EMAIL]`. CDK's default set includes `aws.cognito.signin.user.admin`, which
  would let a leaked token edit its own user in Cognito.
- `authFlows: { userSrp: false }`, which makes CDK emit `ExplicitAuthFlows` holding nothing but
  `ALLOW_REFRESH_TOKEN_AUTH`. Left absent, CDK sets no list and CloudFormation falls back to
  allowing SRP and custom auth.
- A 30-minute ID token and an 8-hour refresh token, so a stolen token dies the same working day
  and MFA runs daily. (The web app never stores the refresh token at all; see Consequences.) Refresh token rotation stays off: setting a grace period makes CDK drop
  `ALLOW_REFRESH_TOKEN_AUTH`.
- The classic hosted pages, not managed login v2. v2 exists for the branding designer and for
  passkeys as a first factor, passkeys need a paid tier, and a v2 domain serves a broken sign-in
  page until a branding style is created out of band — a failure nothing in this repo would catch.

Authorisation is group membership. The pool has an `admins` group, the handler rejects a token
that is not in it, and the group name reaches the handler as an environment variable so infra
stays the single source of truth. A second admin is then a membership change, not a deploy.

The handler re-checks two things API Gateway cannot: that the caller is in the group, and that
`token_use` is `id`. The second closes the gap between what the authorizer accepts and what the
route expects — a Cognito access token carries `client_id` where an ID token carries `aud`.

## Consequences

- Sign-in is Cognito's hosted page: password policy, MFA enrolment and password reset are AWS's
  problem, not ours. `docs/runbooks/admin-access.md` covers creating the account.
- Google sign-in later is an identity provider added to the pool, with no application change.
  GitHub is not, and will not be cheap: it speaks OAuth 2.0, not OIDC, so Cognito cannot federate
  it without a shim. Not worth it for one user.
- $0 at this volume. Lite's free allowance is far above one monthly active user.
- The bearer token, the `tokenHash` SSM parameter and the `Authenticator` interface are not built.
  The "rotate admin token" runbook in §13 of the brief becomes "revoke a session".
- The browser keeps the ID token in `sessionStorage` and nothing else. The refresh token that
  comes back with it is dropped on the floor: no credential that outlives half an hour is ever
  stored where a script could read it, and the price is a trip back through the hosted pages when
  the token runs out. The API has no cookie to ride on, so there is no CSRF surface either.
- The hosted pages return to the site root, not a callback path. The app routes on the hash, and
  the root does not depend on the host's fallback for unknown paths.
- The site has no Content-Security-Policy yet. With a token in `sessionStorage` that is the next
  hardening step worth taking, as a `_headers` file on Pages.
- `infra/test/stacks.test.ts` asserts each hardening decision above, so a later edit that drops
  one fails the build rather than quietly widening access.
