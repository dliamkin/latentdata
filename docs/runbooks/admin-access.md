# Admin access

Getting into the Review tab. The pool, the group, the client and the hosted sign-in pages are all
created by `cdk deploy`; the account inside the pool is not, because a self-service sign-up on an
admin pool would hand the Review tab to anyone who found the domain. Creating it is the one manual
step, done once.

The reasoning behind the settings is in `docs/adr/0014-cognito-for-admin-access.md`.

## 1. Read the stack outputs

After a deploy:

```
aws cloudformation describe-stacks --stack-name CertTracker-prod \
  --query "Stacks[0].Outputs[?starts_with(OutputKey,'Admin')].[OutputKey,OutputValue]" \
  --output table
```

Four values come back. None of them is a secret.

| Output                  | What it is                                             |
| ----------------------- | ------------------------------------------------------ |
| `AdminApiUrl`           | the HTTP API base, e.g. `https://abc123.execute-api…`  |
| `AdminHostedUiUrl`      | the Cognito sign-in pages                              |
| `AdminUserPoolId`       | needed by the commands below                           |
| `AdminUserPoolClientId` | the browser client; the web app needs it at build time |

## 2. Create your account

Replace `<pool-id>` with `AdminUserPoolId` and use your own address. Do not invent a password —
the point of the temporary one is that it is replaced at first sign-in.

```
aws cognito-idp admin-create-user \
  --user-pool-id <pool-id> \
  --username you@example.com \
  --user-attributes Name=email,Value=you@example.com Name=email_verified,Value=true \
  --desired-delivery-mediums EMAIL
```

Cognito emails a temporary password. Then put the account in the group that authorises it — being
able to sign in is not the same as being an admin, and the API checks the group, not the sign-in:

```
aws cognito-idp admin-add-user-to-group \
  --user-pool-id <pool-id> \
  --username you@example.com \
  --group-name admins
```

## 3. Check the boundary

`/health` is open, because `infra-deploy.yml` smoke-tests it:

```
curl -s <AdminApiUrl>/health
```

Everything under `/admin` is not. With no token, API Gateway refuses it before the Lambda runs:

```
curl -s -o /dev/null -w '%{http_code}
' <AdminApiUrl>/admin/candidates
```

`401` is the correct answer. A `200` here means the authorizer is missing from the route and the
candidate queue is readable by the internet — stop and fix that before anything else.

## 4. Tell the site where to sign in

The web app reads three values at build time. In Cloudflare → the Pages project → **Settings** →
**Environment variables**, add them to **Production** as plain text (they are identifiers, not
secrets, and they end up in the public bundle either way):

| Variable                 | Stack output            |
| ------------------------ | ----------------------- |
| `VITE_API_BASE_URL`      | `AdminApiUrl`           |
| `VITE_COGNITO_DOMAIN`    | `AdminHostedUiUrl`      |
| `VITE_COGNITO_CLIENT_ID` | `AdminUserPoolClientId` |

Then **Deployments** → the latest production deployment → **Retry deployment**, so a build picks
them up. Leave Preview without them: preview URLs are not registered with Cognito as places a
sign-in may return to, and the dialog there says sign-in is not set up.

## 5. Sign in

On the site, open the ⋮ menu → **Admin…** (or press Shift+A twice) → **Sign in**.

The first time, Cognito asks for the temporary password from the email, then a new one (16
characters, mixed case, a digit and a symbol), then shows a QR code for an authenticator app. Scan
it and enter the six-digit code. MFA is mandatory, so this cannot be skipped.

You come back to the site on the **Review** tab, with whatever the pipeline has queued. Approving a
candidate writes the offer and it goes live with the next publish (within 15 minutes); dismissing
drops it. Open the offer page and the source before approving — there is no undo in the UI.

The session lasts 30 minutes and ends when the tab closes. Nothing longer-lived is kept in the
browser, so after that it is **Admin…** → **Sign in** again; within the hour Cognito still remembers
you and sends you straight back, after that it asks for the password and code.

## Routine jobs

**A stolen laptop, or any session you want gone.** Revocation is per user, and takes effect for
the refresh token immediately; an ID token already issued stays valid for up to 30 minutes.

```
aws cognito-idp admin-user-global-sign-out --user-pool-id <pool-id> --username you@example.com
```

**A forgotten password.** Use "Forgot your password?" on the hosted page; it mails a code to the
verified address. `admin-set-user-password` also works but leaves the password in your shell
history, so prefer the page.

**A lost authenticator.** Nobody can sign in without it, and there is only one account, so this
needs AWS credentials rather than another factor:

```
aws cognito-idp admin-set-user-mfa-preference \
  --user-pool-id <pool-id> --username you@example.com \
  --software-token-mfa-settings Enabled=false,PreferredMfa=false
```

The next sign-in then asks to enrol a new authenticator. Re-enrol straight away: the account has
no second factor until you do.

**A second admin.** `admin-create-user`, then `admin-add-user-to-group` with `admins`. No deploy,
no code change.
