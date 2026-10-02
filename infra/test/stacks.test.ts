import { readFileSync } from 'node:fs';

import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';

import { CertTrackerStack } from '../lib/cert-tracker-stack.ts';
import { loadStageConfig, parseStage, type Stage } from '../lib/config.ts';
import { GithubOidcStack } from '../lib/github-oidc-stack.ts';

const GITHUB = { owner: 'someone', repo: 'somewhere' };
const ENV = { account: '111111111111', region: 'us-east-1' };

// the same feature flags a real synth runs with, so the assertions describe what deploys
const cdkJson = JSON.parse(readFileSync(new URL('../cdk.json', import.meta.url), 'utf8')) as {
  context: Record<string, unknown>;
};

function app(): App {
  // bundling is esbuild's job and `cdk synth` in CI exercises it; here it would only be slow
  return new App({ context: { ...cdkJson.context, 'aws:cdk:bundling-stacks': [] } });
}

function mainStack(stage: Stage): Template {
  return Template.fromStack(
    new CertTrackerStack(app(), `CertTracker-${stage}`, {
      stage,
      config: loadStageConfig(stage),
      github: GITHUB,
      alertEmail: 'alerts@example.invalid',
      env: ENV,
    }),
  );
}

interface Resource {
  Type: string;
  Properties: Record<string, unknown>;
}
const resources = (template: Template, type: string): Resource[] =>
  Object.values(template.findResources(type) as Record<string, Resource>);

const prod = mainStack('prod');
const dev = mainStack('dev');

describe('table', () => {
  it('is protected in prod and disposable in dev', () => {
    prod.hasResource('AWS::DynamoDB::Table', {
      DeletionPolicy: 'Retain',
      Properties: {
        TableName: 'cert-tracker-prod',
        DeletionProtectionEnabled: true,
        PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
        StreamSpecification: { StreamViewType: 'NEW_AND_OLD_IMAGES' },
        TimeToLiveSpecification: { AttributeName: 'expiresAt', Enabled: true },
      },
    });
    dev.hasResource('AWS::DynamoDB::Table', {
      DeletionPolicy: 'Delete',
      Properties: { DeletionProtectionEnabled: false },
    });
  });

  it.each([
    ['prod', prod],
    ['dev', dev],
  ])('stays inside the free provisioned capacity in %s', (_stage, template) => {
    const [table] = resources(template, 'AWS::DynamoDB::Table');
    const props = table?.Properties as {
      BillingMode?: string;
      ProvisionedThroughput: { ReadCapacityUnits: number; WriteCapacityUnits: number };
      GlobalSecondaryIndexes: {
        ProvisionedThroughput: { ReadCapacityUnits: number; WriteCapacityUnits: number };
      }[];
    };
    const all = [
      props.ProvisionedThroughput,
      ...props.GlobalSecondaryIndexes.map((g) => g.ProvisionedThroughput),
    ];
    expect(props.BillingMode).not.toBe('PAY_PER_REQUEST');
    expect(all.reduce((n, t) => n + t.ReadCapacityUnits, 0)).toBeLessThanOrEqual(8);
    expect(all.reduce((n, t) => n + t.WriteCapacityUnits, 0)).toBeLessThanOrEqual(8);
    template.resourceCountIs('AWS::ApplicationAutoScaling::ScalableTarget', 0);
  });
});

describe('functions', () => {
  it('are all arm64 on nodejs24.x with source maps on', () => {
    const functions = resources(prod, 'AWS::Lambda::Function');
    expect(functions.length).toBe(6);
    for (const fn of functions) {
      expect(fn.Properties).toMatchObject({
        Runtime: 'nodejs24.x',
        Architectures: ['arm64'],
        Environment: {
          Variables: {
            STAGE: 'prod',
            POWERTOOLS_SERVICE_NAME: 'cert-tracker',
            NODE_OPTIONS: '--enable-source-maps',
          },
        },
      });
    }
  });

  it('all have somewhere for failures to go, bar the one that answers a caller', () => {
    for (const fn of resources(prod, 'AWS::Lambda::Function')) {
      // the api function is invoked synchronously by API Gateway, which gets the 500 itself
      if (fn.Properties.FunctionName === 'cert-tracker-prod-api') {
        expect(fn.Properties.DeadLetterConfig).toBeUndefined();
        continue;
      }
      expect(fn.Properties.DeadLetterConfig).toBeDefined();
    }
  });

  it('never reserve concurrency, which a fresh account cannot afford', () => {
    for (const fn of resources(prod, 'AWS::Lambda::Function')) {
      expect(fn.Properties.ReservedConcurrentExecutions).toBeUndefined();
    }
  });

  it('keep logs for two weeks in prod and three days in dev', () => {
    for (const group of resources(prod, 'AWS::Logs::LogGroup')) {
      expect(group.Properties.RetentionInDays).toBe(14);
    }
    for (const group of resources(dev, 'AWS::Logs::LogGroup')) {
      expect(group.Properties.RetentionInDays).toBe(3);
    }
  });

  it('trace in prod only', () => {
    prod.hasResourceProperties('AWS::Lambda::Function', { TracingConfig: { Mode: 'Active' } });
    for (const fn of resources(dev, 'AWS::Lambda::Function')) {
      expect(fn.Properties.TracingConfig).toBeUndefined();
    }
  });
});

describe('iam', () => {
  it('has no statement on Resource * outside X-Ray and CloudWatch Logs', () => {
    for (const policy of resources(prod, 'AWS::IAM::Policy')) {
      const document = policy.Properties.PolicyDocument as {
        Statement: { Action: string | string[]; Resource: unknown }[];
      };
      for (const statement of document.Statement) {
        if (statement.Resource !== '*') continue;
        const actions = [statement.Action].flat();
        expect(actions.every((a) => a.startsWith('xray:') || a.startsWith('logs:'))).toBe(true);
      }
    }
  });

  it('lets the publisher read exactly its three parameters', () => {
    const statements = resources(prod, 'AWS::IAM::Policy').flatMap((policy) => {
      const document = policy.Properties.PolicyDocument as {
        Statement: { Action: string | string[]; Resource: unknown }[];
      };
      return document.Statement.filter((s) => [s.Action].flat().includes('ssm:GetParameter'));
    });
    const publisher = statements.filter((st) =>
      JSON.stringify(st.Resource).includes('appPrivateKey'),
    );
    expect(publisher).toHaveLength(1);
    const rendered = JSON.stringify(publisher[0]?.Resource);
    for (const name of ['appId', 'appInstallationId', 'appPrivateKey']) {
      expect(rendered).toContain(`parameter/cert-tracker/prod/github/${name}`);
    }
    expect([publisher[0]?.Resource].flat()).toHaveLength(3);
    expect(rendered).not.toContain('*');
  });
});

describe('events', () => {
  it('has one shared DLQ behind every consumer queue', () => {
    const queues = resources(prod, 'AWS::SQS::Queue');
    expect(queues.map((q) => q.Properties.QueueName).sort()).toEqual([
      'cert-tracker-prod-dlq',
      'cert-tracker-prod-notify',
      'cert-tracker-prod-publish',
      'cert-tracker-prod-triage',
      'cert-tracker-prod-verify',
    ]);
    const consumers = queues.filter((q) => q.Properties.QueueName !== 'cert-tracker-prod-dlq');
    for (const queue of consumers) {
      expect(queue.Properties.RedrivePolicy).toMatchObject({ maxReceiveCount: 3 });
    }
  });

  it('only wakes the publisher for public discoveries and openings', () => {
    prod.hasResourceProperties('AWS::SNS::Subscription', {
      Protocol: 'sqs',
      RawMessageDelivery: true,
      FilterPolicy: {
        audience: ['public'],
        type: ['offer.discovered', 'offer.window_opened'],
      },
    });
  });

  it('lets the LLM functions read exactly the LLM parameters and nothing else', () => {
    const rendered = JSON.stringify(prod.toJSON());
    for (const name of ['anthropic/apiKey', 'llm/triageModel', 'llm/pricing', 'github/token']) {
      expect(rendered).toContain(`parameter/cert-tracker/prod/${name}`);
    }
    expect(rendered).not.toContain('parameter/cert-tracker/prod/llm/*');
    expect(rendered).not.toContain('parameter/cert-tracker/prod/*');
  });

  it('runs the publisher and the status job on Scheduler, not on legacy rules', () => {
    prod.resourceCountIs('AWS::Scheduler::Schedule', 3);
    prod.hasResourceProperties('AWS::Scheduler::Schedule', {
      ScheduleExpression: 'cron(7 * * * ? *)',
    });
    prod.resourceCountIs('AWS::Events::Rule', 0);
    prod.hasResourceProperties('AWS::Scheduler::Schedule', {
      ScheduleExpression: 'cron(17 4 * * ? *)',
    });
    prod.hasResourceProperties('AWS::Scheduler::Schedule', {
      ScheduleExpression: 'rate(15 minutes)',
    });
    prod.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
      ScalingConfig: { MaximumConcurrency: 2 },
    });
  });
});

describe('admin access', () => {
  it('lets nobody sign themselves up, and makes the one account use TOTP', () => {
    prod.hasResourceProperties('AWS::Cognito::UserPool', {
      AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
      MfaConfiguration: 'ON',
      EnabledMfas: ['SOFTWARE_TOKEN_MFA'],
      Policies: { PasswordPolicy: { MinimumLength: 16, RequireSymbols: true } },
    });
  });

  it('stays on the tier that bills nothing', () => {
    prod.hasResourceProperties('AWS::Cognito::UserPool', { UserPoolTier: 'LITE' });
  });

  it('keeps the pool when the prod stack goes away', () => {
    prod.hasResource('AWS::Cognito::UserPool', { DeletionPolicy: 'Retain' });
    dev.hasResource('AWS::Cognito::UserPool', { DeletionPolicy: 'Delete' });
  });

  it('offers the browser the code grant and nothing else', () => {
    const [client] = resources(prod, 'AWS::Cognito::UserPoolClient');
    const props = client?.Properties as {
      AllowedOAuthFlows: string[];
      AllowedOAuthScopes: string[];
      ExplicitAuthFlows: string[];
      GenerateSecret?: boolean;
      PreventUserExistenceErrors: string;
      EnableTokenRevocation: boolean;
      CallbackURLs: string[];
    };
    // the implicit grant returns tokens in the URL fragment; CDK turns it on unless told not to
    expect(props.AllowedOAuthFlows).toEqual(['code']);
    // CDK's default scope set includes this one, which would let a token edit its own user
    expect(props.AllowedOAuthScopes).not.toContain('aws.cognito.signin.user.admin');
    // with authFlows left out, CloudFormation would also allow SRP and custom auth
    expect(props.ExplicitAuthFlows).toEqual(['ALLOW_REFRESH_TOKEN_AUTH']);
    expect(props.GenerateSecret).not.toBe(true);
    expect(props.PreventUserExistenceErrors).toBe('ENABLED');
    expect(props.EnableTokenRevocation).toBe(true);
    expect(props.CallbackURLs).toEqual(['https://latentdata.org/admin/callback']);
  });

  it('authorises by group membership, which the handler checks', () => {
    prod.hasResourceProperties('AWS::Cognito::UserPoolGroup', { GroupName: 'admins' });
  });

  it('serves the classic hosted pages, which need no branding style to work', () => {
    prod.hasResourceProperties('AWS::Cognito::UserPoolDomain', { ManagedLoginVersion: 1 });
  });

  it('puts the authorizer on every admin route and leaves health open', () => {
    const routes = resources(prod, 'AWS::ApiGatewayV2::Route');
    const byKey = new Map(
      routes.map((route) => [String(route.Properties.RouteKey), route.Properties]),
    );
    expect(byKey.size).toBeGreaterThan(0);
    for (const [key, props] of byKey) {
      if (key.includes('/admin')) {
        expect(props.AuthorizationType).toBe('JWT');
        expect(props.AuthorizerId).toBeDefined();
      } else {
        expect(props.AuthorizerId).toBeUndefined();
      }
    }
    expect(byKey.has('GET /health')).toBe(true);
    expect(byKey.has('GET /admin/candidates')).toBe(true);
  });

  it('validates the token in API Gateway, before any of my code runs', () => {
    prod.hasResourceProperties('AWS::ApiGatewayV2::Authorizer', {
      AuthorizerType: 'JWT',
      IdentitySource: ['$request.header.Authorization'],
    });
  });

  it('logs who called which route, and throttles the endpoint', () => {
    prod.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      AccessLogSettings: { DestinationArn: Match.anyValue() },
      DefaultRouteSettings: { ThrottlingBurstLimit: 20, ThrottlingRateLimit: 10 },
    });
  });

  it('cannot write to the table while it only reads', () => {
    const policies = Object.entries(
      prod.findResources('AWS::IAM::Policy') as Record<string, Resource>,
    );
    const apiPolicy = policies.find(([id]) => /apiFunction/i.test(id))?.[1];
    expect(apiPolicy).toBeDefined();
    const statements = (
      apiPolicy?.Properties.PolicyDocument as { Statement: { Action: string | string[] }[] }
    ).Statement;
    const actions = statements.flatMap((s) => (Array.isArray(s.Action) ? s.Action : [s.Action]));
    for (const write of ['dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:DeleteItem']) {
      expect(actions).not.toContain(write);
    }
    expect(actions).toContain('dynamodb:Query');
  });

  it('only lets the site origin call the api from a browser', () => {
    prod.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      CorsConfiguration: {
        AllowOrigins: ['https://latentdata.org'],
        AllowHeaders: ['authorization', 'content-type'],
      },
    });
  });
});

describe('cost guards', () => {
  it('owns exactly two budgets, in prod only', () => {
    prod.resourceCountIs('AWS::Budgets::Budget', 2);
    dev.resourceCountIs('AWS::Budgets::Budget', 0);
    prod.hasResourceProperties('AWS::Budgets::Budget', {
      Budget: { BudgetLimit: { Amount: 1, Unit: 'USD' } },
    });
    prod.hasResourceProperties('AWS::Budgets::Budget', {
      Budget: { BudgetLimit: { Amount: 10, Unit: 'USD' } },
    });
  });

  it('alarms on single metrics only, and stays under ten', () => {
    const alarms = resources(prod, 'AWS::CloudWatch::Alarm');
    expect(alarms.length).toBeLessThanOrEqual(10);
    for (const alarm of alarms) {
      expect(alarm.Properties.Metrics).toBeUndefined();
      expect(alarm.Properties.MetricName).toBeDefined();
      expect(alarm.Properties.AlarmActions).toHaveLength(1);
    }
    prod.resourceCountIs('AWS::CloudWatch::CompositeAlarm', 0);
  });

  it('uses none of the services the design rules out', () => {
    for (const type of [
      'AWS::SecretsManager::Secret',
      'AWS::Route53::HostedZone',
      'AWS::ApiGateway::RestApi',
      'AWS::Lambda::Url',
    ]) {
      prod.resourceCountIs(type, 0);
    }
  });
});

describe('tags and config', () => {
  it('parses the stage strictly', () => {
    expect(parseStage('prod')).toBe('prod');
    expect(() => parseStage('staging')).toThrow();
    expect(() => parseStage(undefined)).toThrow();
  });
});

describe('github oidc stack', () => {
  const oidc = Template.fromStack(new GithubOidcStack(app(), 'Oidc', { github: GITHUB, env: ENV }));

  it('trusts GitHub for this repository only, by environment and by pull request', () => {
    oidc.hasResourceProperties('AWS::IAM::OIDCProvider', {
      Url: 'https://token.actions.githubusercontent.com',
      ClientIdList: ['sts.amazonaws.com'],
    });
    const subjects = resources(oidc, 'AWS::IAM::Role').map((role) => {
      const doc = role.Properties.AssumeRolePolicyDocument as {
        Statement: { Condition: { StringEquals: Record<string, string> } }[];
      };
      const condition = doc.Statement[0]?.Condition.StringEquals ?? {};
      expect(condition['token.actions.githubusercontent.com:aud']).toBe('sts.amazonaws.com');
      return condition['token.actions.githubusercontent.com:sub'];
    });
    expect(subjects.sort()).toEqual([
      'repo:someone/somewhere:environment:prod',
      'repo:someone/somewhere:pull_request',
    ]);
  });

  it('matches immutable subjects when the repository ids are configured', () => {
    const immutable = Template.fromStack(
      new GithubOidcStack(app(), 'OidcImmutable', {
        github: { ...GITHUB, ownerId: '42', repoId: '1337' },
        env: ENV,
      }),
    );
    const rendered = JSON.stringify(immutable.toJSON());
    expect(rendered).toContain('repo:someone@42/somewhere@1337:environment:prod');
    expect(rendered).toContain('repo:someone@42/somewhere@1337:pull_request');
    expect(rendered).not.toContain('repo:someone/somewhere:');
  });

  it('gives neither role a wildcard resource or an admin policy', () => {
    for (const role of resources(oidc, 'AWS::IAM::Role')) {
      expect(role.Properties.ManagedPolicyArns).toBeUndefined();
    }
    for (const policy of resources(oidc, 'AWS::IAM::Policy')) {
      const document = policy.Properties.PolicyDocument as { Statement: { Resource: unknown }[] };
      for (const statement of document.Statement) expect(statement.Resource).not.toBe('*');
    }
  });
});
