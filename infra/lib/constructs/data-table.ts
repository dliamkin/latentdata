import {
  AttributeType,
  BillingMode,
  ProjectionType,
  StreamViewType,
  Table,
} from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

import { resourceName, stageSettings, type Stage } from '../config.ts';

// the always-free allowance is 25 RCU / 25 WCU per account; this stays well inside it and
// never autoscales, because autoscaling can climb past the free ceiling on its own
export const BASE_CAPACITY = 5;
export const GSI1_CAPACITY = 3;

export class DataTable extends Construct {
  readonly table: Table;

  constructor(scope: Construct, id: string, props: { stage: Stage }) {
    super(scope, id);
    const settings = stageSettings(props.stage);

    this.table = new Table(this, 'Table', {
      tableName: resourceName(props.stage),
      partitionKey: { name: 'PK', type: AttributeType.STRING },
      sortKey: { name: 'SK', type: AttributeType.STRING },
      billingMode: BillingMode.PROVISIONED,
      readCapacity: BASE_CAPACITY,
      writeCapacity: BASE_CAPACITY,
      timeToLiveAttribute: 'expiresAt',
      stream: StreamViewType.NEW_AND_OLD_IMAGES,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: settings.isProd },
      deletionProtection: settings.isProd,
      removalPolicy: settings.removalPolicy,
    });

    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
      readCapacity: GSI1_CAPACITY,
      writeCapacity: GSI1_CAPACITY,
    });
  }
}
