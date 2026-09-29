import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import { type GitHubRepo, type Stage, type StageConfig } from './config.ts';
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

    this.observability = new Observability(this, 'Observability', {
      stage,
      alertEmail: props.alertEmail,
      table: this.data.table,
      deadLetterQueue: this.events.deadLetterQueue,
      queues: [this.events.notifyQueue, this.events.publishQueue],
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
  }
}
