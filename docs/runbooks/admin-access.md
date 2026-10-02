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

## 3. Sign in once, and enrol the authenticator

Open `AdminHostedUiUrl` with the client id appended, so Cognito knows which app is asking:

```
<AdminHostedUiUrl>/login?client_id=<client-id>&response_type=code&scope=openid+email&redirect_uri=https://latentdata.org/admin/callback
```

Sign in with the temporary password. Cognito asks for a new one (16 characters, mixed case, a
digit and a symbol), then shows a QR code for an authenticator app. Scan it and enter the
six-digit code. MFA is mandatory, so this happens on the first sign-in and cannot be skipped.

You land on `…/admin/callback?code=…`. A one-time code in the URL and nothing to receive it yet is
the expected end of this runbook — the web app's half of the exchange is the next increment. Reaching
this point proves the pool, the group, the client and the hosted pages all work.

## 4. Check the boundary

`/health` is open, because `infra-deploy.yml` smoke-tests it:

```
curl -s <AdminApiUrl>/health
```

Everything under `/admin` is not. With no token, API Gateway refuses it before the Lambda runs:

```
curl -s -o /dev/null -w '%{http_code}\n' <AdminApiUrl>/admin/candidates
```

`401` is the correct answer. A `200` here means the authorizer is missing from the route and the
candidate queue is readable by the internet — stop and fix that before anything else.

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
