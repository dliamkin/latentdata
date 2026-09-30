import { Duration } from 'aws-cdk-lib';
import {
  Alarm,
  ComparisonOperator,
  Dashboard,
  GraphWidget,
  Metric,
  TreatMissingData,
  type IMetric,
} from 'aws-cdk-lib/aws-cloudwatch';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import type { Table } from 'aws-cdk-lib/aws-dynamodb';
import type { IFunction } from 'aws-cdk-lib/aws-lambda';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { EmailSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import type { Queue } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

import { resourceName, type Stage } from '../config.ts';

const METRIC_NAMESPACE = 'cert-tracker';
const PUBLISH_ALARM_THRESHOLD = 150;

export interface ObservabilityProps {
  stage: Stage;
  alertEmail: string;
  llmDailyCapUsd: number;
  pollFunction: IFunction;
  table: Table;
  deadLetterQueue: Queue;
  queues: Queue[];
  functions: IFunction[];
}

export class Observability extends Construct {
  readonly alerts: Topic;
  readonly alarms: Alarm[] = [];

  private readonly stage: Stage;

  constructor(scope: Construct, id: string, props: ObservabilityProps) {
    super(scope, id);
    this.stage = props.stage;

    this.alerts = new Topic(this, 'Alerts', {
      topicName: resourceName(props.stage, 'alerts'),
      enforceSSL: true,
    });
    this.alerts.addSubscription(new EmailSubscription(props.alertEmail));

    // each alarm reads exactly one metric; metric math is billed per metric it touches and
    // would push the account past the ten free alarm metrics
    this.alarm('DeadLetters', {
      metric: props.deadLetterQueue.metricApproximateNumberOfMessagesVisible({
        period: Duration.minutes(5),
        statistic: 'Maximum',
      }),
      threshold: 1,
      description: 'Something failed three times and was parked in the shared DLQ.',
    });
    this.alarm('TableWriteThrottles', {
      metric: new Metric({
        namespace: 'AWS/DynamoDB',
        metricName: 'WriteThrottleEvents',
        dimensionsMap: { TableName: props.table.tableName },
        period: Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 1,
      description: 'The table throttled a write. A design smell, not a reason to add capacity.',
    });
    this.alarm('LambdaThrottles', {
      metric: new Metric({
        namespace: 'AWS/Lambda',
        metricName: 'Throttles',
        period: Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 1,
      description: 'A function was throttled; the account concurrency limit is too low.',
    });
    this.alarm('PollErrors', {
      metric: props.pollFunction.metricErrors({ period: Duration.hours(3), statistic: 'Sum' }),
      threshold: 1,
      description: 'The hourly poll failed outright; discovery has stopped.',
    });
    this.alarm('LlmCostUsd', {
      metric: this.customMetric('LlmCostUsd', 'Sum', Duration.days(1)),
      threshold: props.llmDailyCapUsd,
      description: 'LLM spend recorded today reached the daily cap; signals are being parked.',
    });
    this.alarm('SourcesUnhealthy', {
      metric: this.customMetric('SourcesUnhealthy', 'Maximum', Duration.hours(1)),
      threshold: 3,
      description: 'Three or more sources have failed three polls in a row.',
    });
    this.alarm('PublishCountMonth', {
      metric: this.customMetric('PublishCountMonth', 'Maximum', Duration.days(1)),
      threshold: PUBLISH_ALARM_THRESHOLD,
      description: 'Snapshot commits this month are approaching the cap of 200.',
    });

    const dashboard = new Dashboard(this, 'Dashboard', {
      dashboardName: resourceName(props.stage),
    });
    dashboard.addWidgets(
      new GraphWidget({
        title: 'Invocations',
        left: props.functions.map((fn) => fn.metricInvocations({ period: Duration.minutes(15) })),
        width: 8,
      }),
      new GraphWidget({
        title: 'Errors',
        left: props.functions.map((fn) => fn.metricErrors({ period: Duration.minutes(15) })),
        width: 8,
      }),
      new GraphWidget({
        title: 'Duration (p95)',
        left: props.functions.map((fn) =>
          fn.metricDuration({ period: Duration.minutes(15), statistic: 'p95' }),
        ),
        width: 8,
      }),
    );
    dashboard.addWidgets(
      new GraphWidget({
        title: 'Queue depth',
        left: props.queues.map((queue) => queue.metricApproximateNumberOfMessagesVisible()),
        width: 12,
      }),
      new GraphWidget({
        title: 'Dead letters',
        left: [props.deadLetterQueue.metricApproximateNumberOfMessagesVisible()],
        width: 6,
      }),
      new GraphWidget({
        title: 'LLM spend (USD)',
        left: [this.customMetric('LlmCostUsd', 'Sum', Duration.days(1))],
        width: 6,
      }),
      new GraphWidget({
        title: 'Signals and relevance',
        left: [
          this.customMetric('SignalsNew', 'Sum', Duration.days(1)),
          this.customMetric('TriageRelevant', 'Sum', Duration.days(1)),
          this.customMetric('OffersDiscovered', 'Sum', Duration.days(1)),
        ],
        width: 6,
      }),
      new GraphWidget({
        title: 'Snapshot commits this month',
        left: [this.customMetric('PublishCountMonth', 'Maximum', Duration.days(1))],
        width: 6,
      }),
    );
  }

  customMetric(metricName: string, statistic: string, period: Duration): Metric {
    return new Metric({
      namespace: METRIC_NAMESPACE,
      metricName,
      dimensionsMap: { service: METRIC_NAMESPACE, stage: this.stage },
      statistic,
      period,
    });
  }

  alarm(id: string, props: { metric: IMetric; threshold: number; description: string }): Alarm {
    const alarm = new Alarm(this, `${id}Alarm`, {
      alarmName: resourceName(this.stage, id),
      alarmDescription: props.description,
      metric: props.metric,
      threshold: props.threshold,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });
    alarm.addAlarmAction(new SnsAction(this.alerts));
    this.alarms.push(alarm);
    return alarm;
  }
}
