# AWS: one-time setup

Everything here is done once, by the account owner, by hand. Work through it in order. Nothing
in it costs money beyond a few cents for the CDK bootstrap bucket.

Pick one region and use it for every step. The examples use `us-east-1`.

## 1. Account

1. Create the AWS account, or use an existing one. Choose the **Paid plan**, or upgrade to it
   before month six: accounts on the Free plan close themselves after six months.
2. Turn on MFA for the root user, then stop using the root user.

## 2. Identity Center (your own login)

1. Console → **IAM Identity Center** → **Enable**, in your region.
2. **Users** → **Add user**. Use your own email. Accept the invitation and set up MFA.
3. **Permission sets** → **Create** → predefined → `AdministratorAccess`.
4. **AWS accounts** → select the account → **Assign users** → your user, that permission set.
5. On your laptop, install AWS CLI v2, then:

   ```
   aws configure sso
   ```

   Give it the start URL from the Identity Center dashboard, your region, and a profile name
   such as `cert-tracker`. After that, every session starts with:

   ```
   aws sso login --profile cert-tracker
   $env:AWS_PROFILE = "cert-tracker"
   ```

   Never create IAM access keys.

## 3. CDK bootstrap and the OIDC stack

From the repository root, logged in as above:

```
npm ci
npx -w infra cdk bootstrap -c stage=prod -c alertEmail=<your address>
npx -w infra cdk deploy CertTrackerGithubOidc -c stage=prod -c alertEmail=<your address>
```

The second command prints two outputs, `DeployRoleArn` and `ReadonlyRoleArn`.

If a workflow later fails with "Not authorized to perform sts:AssumeRoleWithWebIdentity", the
subject GitHub sends does not match the one the roles trust. Compare the prefix from
`gh api repos/<owner>/<repo>/actions/oidc/customization/sub` with `githubOwnerId` and
`githubRepoId` in `infra/cdk.json`, fix the ids, and deploy this stack again.

In GitHub → repository **Settings** → **Secrets and variables** → **Actions** → **Variables**,
add four repository variables:

| Name                    | Value                         |
| ----------------------- | ----------------------------- |
| `AWS_DEPLOY_ROLE_ARN`   | the `DeployRoleArn` output    |
| `AWS_READONLY_ROLE_ARN` | the `ReadonlyRoleArn` output  |
| `AWS_REGION`            | your region                   |
| `ALERT_EMAIL`           | where alarms and budgets mail |

They are variables, not secrets: none of them grants access on its own.

Then **Settings** → **Environments** → **New environment** → `prod`, and add yourself as a
required reviewer. The deploy role only trusts jobs that run in this environment.

Optional: **Service Quotas** → AWS Lambda → "Concurrent executions" → request 1000. New accounts
often start at 10. The design works either way.

## 4. GitHub App (the publisher's identity)

1. GitHub → your profile **Settings** → **Developer settings** → **GitHub Apps** → **New**.
2. Name it anything. Homepage URL: the repository. Untick **Webhook → Active**.
3. **Repository permissions** → **Contents: Read and write**. Nothing else.
4. "Where can this GitHub App be installed?" → **Only on this account**. Create.
5. Note the **App ID**. Under **Private keys**, generate one; a `.pem` file downloads.
6. **Install App** → your account → **Only select repositories** → this repository. The
   number at the end of the URL after installing is the **installation id**.
7. Repository **Settings** → **Rules** → **Rulesets** → `main` → **Bypass list** → add the
   App, mode **Always**.

## 5. SSM parameters

Created by you, never by CI. All are `SecureString`. For M2 only the GitHub App ones are needed:

```
aws ssm put-parameter --type SecureString --name /cert-tracker/prod/github/appId --value "<app id>"
aws ssm put-parameter --type SecureString --name /cert-tracker/prod/github/appInstallationId --value "<installation id>"
aws ssm put-parameter --type SecureString --name /cert-tracker/prod/github/appPrivateKey --value "file://<path to the .pem>"
```

Delete the `.pem` from your laptop afterwards. The parameter is the only copy that matters.

The rest arrive with the milestones that use them:

| Parameter                                            | Needed from |
| ---------------------------------------------------- | ----------- |
| `/cert-tracker/prod/anthropic/apiKey`                | M3          |
| `/cert-tracker/prod/github/token`                    | M3          |
| `/cert-tracker/prod/llm/triageModel`, `/verifyModel` | M3          |
| `/cert-tracker/prod/llm/pricing`, `/dailyCapUsd`     | M3          |
| `/cert-tracker/prod/admin/tokenHash`                 | M4          |
| `/cert-tracker/prod/ntfy/topic`, `/ntfy/token`       | M5          |

## 6. First deploy and the seed

Merging the M2 pull request deploys the main stack through `infra-deploy`. Approve the run when
GitHub asks. Then, from your laptop:

```
npm run seed:import -- --stage prod --dry-run
npm run seed:import -- --stage prod
```

The dry run validates both seed files and writes nothing. The real run is safe to repeat: it
never overwrites an item that already exists.

Within 15 minutes the publisher commits a fresh `snapshot.json` to `main` and Cloudflare Pages
rebuilds the site. Confirm the alert email subscription when SNS sends it.

## Checks

- `aws sts get-caller-identity` shows your SSO role, not a user.
- The `infra-deploy` run is green and its last lines list the stack outputs.
- CloudWatch → Dashboards → `cert-tracker-prod` exists.
- Billing → Budgets shows exactly two budgets.
- `git log --author="[bot]" -3` on `main` shows a `data: snapshot …` commit.
