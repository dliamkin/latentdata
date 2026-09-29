import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import { CfnOIDCProvider, FederatedPrincipal, PolicyStatement, Role } from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

import { oidcSubjectPrefix, type GitHubRepo } from './config.ts';

const ISSUER = 'token.actions.githubusercontent.com';
// the qualifier `cdk bootstrap` uses unless told otherwise
const BOOTSTRAP_QUALIFIER = 'hnb659fds';

export interface GithubOidcStackProps extends StackProps {
  github: GitHubRepo;
}

// deployed once, by hand, from a laptop with SSO. After that CI never needs a stored key:
// GitHub proves which repo and which trigger is asking, and AWS hands out a short-lived role.
export class GithubOidcStack extends Stack {
  readonly deployRole: Role;
  readonly readonlyRole: Role;

  constructor(scope: Construct, id: string, props: GithubOidcStackProps) {
    super(scope, id, props);
    const repo = oidcSubjectPrefix(props.github);

    const provider = new CfnOIDCProvider(this, 'Provider', {
      url: `https://${ISSUER}`,
      clientIdList: ['sts.amazonaws.com'],
    });

    const trustedBy = (subject: string): FederatedPrincipal =>
      new FederatedPrincipal(
        provider.attrArn,
        {
          StringEquals: {
            [`${ISSUER}:aud`]: 'sts.amazonaws.com',
            [`${ISSUER}:sub`]: subject,
          },
        },
        'sts:AssumeRoleWithWebIdentity',
      );

    const bootstrapRole = (kind: string): string =>
      this.formatArn({
        service: 'iam',
        region: '',
        resource: 'role',
        resourceName: `cdk-${BOOTSTRAP_QUALIFIER}-${kind}-role-${this.account}-${this.region}`,
      });

    // a job that declares `environment: prod` presents this subject, not a ref: one, so
    // there is deliberately no branch condition here
    this.deployRole = new Role(this, 'DeployRole', {
      roleName: 'cert-tracker-github-deploy',
      assumedBy: trustedBy(`${repo}:environment:prod`),
      maxSessionDuration: Duration.hours(1),
      description: 'Assumed by the infra-deploy workflow; can only act through the CDK roles.',
    });
    this.deployRole.addToPolicy(
      new PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: ['deploy', 'file-publishing', 'image-publishing', 'lookup'].map(bootstrapRole),
      }),
    );

    this.readonlyRole = new Role(this, 'ReadonlyRole', {
      roleName: 'cert-tracker-github-readonly',
      assumedBy: trustedBy(`${repo}:pull_request`),
      maxSessionDuration: Duration.hours(1),
      description: 'Assumed by the infra-diff workflow on pull requests; read only.',
    });
    this.readonlyRole.addToPolicy(
      new PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [bootstrapRole('lookup')],
      }),
    );
    this.readonlyRole.addToPolicy(
      new PolicyStatement({
        actions: [
          'cloudformation:DescribeStacks',
          'cloudformation:GetTemplate',
          'cloudformation:ListStackResources',
          'cloudformation:DescribeStackResources',
        ],
        resources: [
          this.formatArn({
            service: 'cloudformation',
            resource: 'stack',
            resourceName: 'CertTracker-*/*',
          }),
          this.formatArn({
            service: 'cloudformation',
            resource: 'stack',
            resourceName: 'CDKToolkit/*',
          }),
        ],
      }),
    );
    this.readonlyRole.addToPolicy(
      new PolicyStatement({
        actions: ['s3:GetObject', 's3:ListBucket', 's3:GetBucketLocation'],
        resources: [
          `arn:${this.partition}:s3:::cdk-${BOOTSTRAP_QUALIFIER}-assets-${this.account}-${this.region}`,
          `arn:${this.partition}:s3:::cdk-${BOOTSTRAP_QUALIFIER}-assets-${this.account}-${this.region}/*`,
        ],
      }),
    );
    this.readonlyRole.addToPolicy(
      new PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [
          this.formatArn({
            service: 'ssm',
            resource: 'parameter',
            resourceName: `cdk-bootstrap/${BOOTSTRAP_QUALIFIER}/version`,
          }),
        ],
      }),
    );

    new CfnOutput(this, 'DeployRoleArn', { value: this.deployRole.roleArn });
    new CfnOutput(this, 'ReadonlyRoleArn', { value: this.readonlyRole.roleArn });
  }
}
