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

### M3: the discovery pipeline

Six more parameters, created **before** the M3 deploy is approved. The functions read them at
cold start and fail loudly if one is missing.

The API key comes from a dedicated key in the Anthropic console, on a workspace with its own
monthly spend limit. That limit is the outer fence; `dailyCapUsd` is the inner one. The GitHub
token is a fine-grained personal access token with **no** repository access at all (public
data only): it exists so that commit polling gets 5,000 requests an hour instead of 60.

```
aws ssm put-parameter --type SecureString --name /cert-tracker/prod/anthropic/apiKey --value "<sk-ant-...>"
aws ssm put-parameter --type SecureString --name /cert-tracker/prod/github/token --value "<github_pat_...>"
aws ssm put-parameter --type SecureString --name /cert-tracker/prod/llm/triageModel --value "claude-haiku-4-5"
aws ssm put-parameter --type SecureString --name /cert-tracker/prod/llm/verifyModel --value "claude-sonnet-5-5"
aws ssm put-parameter --type SecureString --name /cert-tracker/prod/llm/dailyCapUsd --value "1"
aws ssm put-parameter --type SecureString --name /cert-tracker/prod/llm/pricing --value '{"claude-haiku-4-5":{"inputPerMTok":1,"outputPerMTok":5,"cacheReadPerMTok":0.1,"cacheWritePerMTok":1.25},"claude-sonnet-5-5":{"inputPerMTok":3,"outputPerMTok":15,"cacheReadPerMTok":0.3,"cacheWritePerMTok":3.75,"webSearchPerRequest":0.01}}'
```

Prices are USD per million tokens; check them against the pricing page when you create the
parameter and again whenever you change a model id. The pipeline only uses them to meter the
daily cap, so an error here moves the fence, it does not change the bill. To change a model
later, overwrite the parameter with `--overwrite` and let the functions cold-start; no deploy.

The rest arrive with the milestones that use them:

| Parameter                                      | Needed from |
| ---------------------------------------------- | ----------- |
| `/cert-tracker/prod/admin/tokenHash`           | M4          |
| `/cert-tracker/prod/ntfy/topic`, `/ntfy/token` | M5          |

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

## 7. Sources after the import

The seed file is an input; after the import the table is the truth. When a feed moves or dies,
fix the seed for the next reader **and** write the change to the table:

```
npm run source:set -- --stage prod --id rss-microsoft-learn-blog --enabled false --notes "2026-09-30: feed removed"
npm run source:set -- --stage prod --id github-commits-free-certifications --url https://api.github.com/repos/ArslanYM/Free-Certifications/commits
```

The script resets the failure counter so the next hourly poll starts clean. The `SourcesUnhealthy`
alarm and the `source.unhealthy` events in the Activity tab are how you find out which ones need it.

## Checks

- `aws sts get-caller-identity` shows your SSO role, not a user.
- The `infra-deploy` run is green and its last lines list the stack outputs.
- CloudWatch → Dashboards → `cert-tracker-prod` exists.
- Billing → Budgets shows exactly two budgets.
- `git log --author="[bot]" -3` on `main` shows a `data: snapshot …` commit.
