import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import { type GitHubRepo, type Stage, type StageConfig } from './config.ts';
import { AdminApi } from './constructs/admin-api.ts';
import { AdminIdentity } from './constructs/admin-identity.ts';
import { Budgets } from './constructs/budgets.ts';
import { DataTable } from './constructs/data-table.ts';
import { Events } from './constructs/events.ts';
import { Observability } from './constructs/observability.ts';
import { PipelineFunctions } from './constructs/pipeline-functions.ts';
import { Secrets } from './constructs/secrets.ts';

export interface CertTrackerStackProps extends StackProps {
  stage: Stage;
  config: StageConfig;
  github: GitHubRepo;
  alertEmail: string;
}

export class CertTrackerStack extends Stack {
  readonly data: DataTable;
  readonly events: Events;
  readonly functions: PipelineFunctions;
  readonly identity: AdminIdentity;
  readonly adminApi: AdminApi;
  readonly observability: Observability;

  constructor(scope: Construct, id: string, props: CertTrackerStackProps) {
    super(scope, id, props);
    const { stage } = props;

    this.data = new DataTable(this, 'Data', { stage });
    this.events = new Events(this, 'Events', { stage });
    const secrets = new Secrets(this, 'Secrets', { stage });

    this.functions = new PipelineFunctions(this, 'Pipeline', {
      stage,
      table: this.data.table,
      events: this.events,
      secrets,
      github: props.github,
    });

    this.identity = new AdminIdentity(this, 'AdminIdentity', {
      stage,
      siteOrigins: props.config.siteOrigins,
    });

    this.adminApi = new AdminApi(this, 'AdminApi', {
      stage,
      handler: this.functions.api,
      identity: this.identity,
      siteOrigins: props.config.siteOrigins,
    });

    this.observability = new Observability(this, 'Observability', {
      stage,
      alertEmail: props.alertEmail,
      llmDailyCapUsd: props.config.llmDailyCapUsd,
      pollFunction: this.functions.poll,
      table: this.data.table,
      deadLetterQueue: this.events.deadLetterQueue,
      queues: [
        this.events.triageQueue,
        this.events.verifyQueue,
        this.events.notifyQueue,
        this.events.publishQueue,
      ],
      functions: this.functions.all,
    });

    if (stage === 'prod') {
      new Budgets(this, 'Budgets', {
        stage,
        alertEmail: props.alertEmail,
        costAnomalyMonitor: props.config.costAnomalyMonitor,
      });
    }

    new CfnOutput(this, 'TableName', { value: this.data.table.tableName });
    new CfnOutput(this, 'EventsTopicArn', { value: this.events.topic.topicArn });
    new CfnOutput(this, 'DeadLetterQueueUrl', { value: this.events.deadLetterQueue.queueUrl });
    // the four values the runbook and the web app's build need; none of them is a secret
    new CfnOutput(this, 'AdminApiUrl', { value: this.adminApi.url });
    new CfnOutput(this, 'AdminHostedUiUrl', { value: this.identity.hostedUiUrl });
    new CfnOutput(this, 'AdminUserPoolId', { value: this.identity.userPool.userPoolId });
    new CfnOutput(this, 'AdminUserPoolClientId', {
      value: this.identity.client.userPoolClientId,
    });
  }
}
