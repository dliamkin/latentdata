import { Stack } from 'aws-cdk-lib';
import { PolicyStatement, type IGrantable } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

import type { Stage } from '../config.ts';

export const GITHUB_APP_PARAMETERS = [
  'github/appId',
  'github/appInstallationId',
  'github/appPrivateKey',
] as const;

export const GITHUB_TOKEN_PARAMETER = 'github/token';

export const LLM_PARAMETERS = [
  'anthropic/apiKey',
  'llm/triageModel',
  'llm/verifyModel',
  'llm/pricing',
  'llm/dailyCapUsd',
] as const;

// references only: the parameters are created by hand and their values never pass through
// CloudFormation, a template, or CI
export class Secrets extends Construct {
  readonly prefix: string;

  constructor(scope: Construct, id: string, props: { stage: Stage }) {
    super(scope, id);
    this.prefix = `/cert-tracker/${props.stage}`;
  }

  parameterArn(name: string): string {
    return Stack.of(this).formatArn({
      service: 'ssm',
      resource: 'parameter',
      resourceName: `${this.prefix.slice(1)}/${name}`,
    });
  }

  // one statement naming exactly the parameters a function reads; never a prefix wildcard
  grantRead(grantee: IGrantable, names: readonly string[]): void {
    grantee.grantPrincipal.addToPrincipalPolicy(
      new PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: names.map((name) => this.parameterArn(name)),
      }),
    );
  }
}
