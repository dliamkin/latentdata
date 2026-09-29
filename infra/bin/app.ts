import { App, Tags } from 'aws-cdk-lib';

import { CertTrackerStack } from '../lib/cert-tracker-stack.ts';
import { loadStageConfig, parseStage, requireString } from '../lib/config.ts';
import { GithubOidcStack } from '../lib/github-oidc-stack.ts';

const app = new App();
const context = (name: string): unknown => app.node.tryGetContext(name);

const stage = parseStage(context('stage'));
const github = {
  owner: requireString(context('githubOwner'), 'context githubOwner'),
  repo: requireString(context('githubRepo'), 'context githubRepo'),
};
const env = {
  // `env` rather than hardcoded values: the account and region come from whoever is deploying
  ...(process.env.CDK_DEFAULT_ACCOUNT === undefined
    ? {}
    : { account: process.env.CDK_DEFAULT_ACCOUNT }),
  ...(process.env.CDK_DEFAULT_REGION === undefined
    ? {}
    : { region: process.env.CDK_DEFAULT_REGION }),
};

new CertTrackerStack(app, `CertTracker-${stage}`, {
  stage,
  config: loadStageConfig(stage),
  github,
  alertEmail: requireString(
    context('alertEmail') ?? process.env.ALERT_EMAIL,
    'the alert address: pass -c alertEmail=<address> or set ALERT_EMAIL',
  ),
  env,
  description: `Cert Promo Tracker (${stage})`,
});

new GithubOidcStack(app, 'CertTrackerGithubOidc', {
  github,
  env,
  description: 'GitHub Actions OIDC provider and the two roles CI assumes',
});

Tags.of(app).add('project', 'cert-tracker');
Tags.of(app).add('stage', stage);
Tags.of(app).add('managed-by', 'cdk');
