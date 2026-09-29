import { CfnBudget } from 'aws-cdk-lib/aws-budgets';
import { CfnAnomalyMonitor, CfnAnomalySubscription } from 'aws-cdk-lib/aws-ce';
import { Construct } from 'constructs';

import { resourceName, type Stage } from '../config.ts';

// the first two budgets in an account are free and the third is billed, so there are exactly
// two and they are only ever created by the prod stack
export const BUDGET_LIMITS_USD = [1, 10];

export interface BudgetsProps {
  stage: Stage;
  alertEmail: string;
  costAnomalyMonitor: boolean;
}

export class Budgets extends Construct {
  constructor(scope: Construct, id: string, props: BudgetsProps) {
    super(scope, id);
    const subscribers = [{ subscriptionType: 'EMAIL', address: props.alertEmail }];

    for (const limit of BUDGET_LIMITS_USD) {
      new CfnBudget(this, `Monthly${String(limit)}Usd`, {
        budget: {
          budgetName: resourceName(props.stage, `${String(limit)}usd`),
          budgetType: 'COST',
          timeUnit: 'MONTHLY',
          budgetLimit: { amount: limit, unit: 'USD' },
        },
        notificationsWithSubscribers: (['ACTUAL', 'FORECASTED'] as const).map(
          (notificationType) => ({
            notification: {
              notificationType,
              comparisonOperator: 'GREATER_THAN',
              threshold: 100,
              thresholdType: 'PERCENTAGE',
            },
            subscribers,
          }),
        ),
      });
    }

    if (props.costAnomalyMonitor) {
      const monitor = new CfnAnomalyMonitor(this, 'AnomalyMonitor', {
        monitorName: resourceName(props.stage, 'services'),
        monitorType: 'DIMENSIONAL',
        monitorDimension: 'SERVICE',
      });
      new CfnAnomalySubscription(this, 'AnomalySubscription', {
        subscriptionName: resourceName(props.stage, 'anomalies'),
        frequency: 'DAILY',
        monitorArnList: [monitor.attrMonitorArn],
        subscribers: [{ type: 'EMAIL', address: props.alertEmail }],
        thresholdExpression: JSON.stringify({
          Dimensions: {
            Key: 'ANOMALY_TOTAL_IMPACT_ABSOLUTE',
            MatchOptions: ['GREATER_THAN_OR_EQUAL'],
            Values: ['1'],
          },
        }),
      });
    }
  }
}
