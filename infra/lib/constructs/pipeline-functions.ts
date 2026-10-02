import { fileURLToPath } from 'node:url';

import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import type { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Architecture, Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { Schedule, ScheduleExpression } from 'aws-cdk-lib/aws-scheduler';
import { LambdaInvoke } from 'aws-cdk-lib/aws-scheduler-targets';
import type { Queue } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

import { resourceName, stageSettings, type GitHubRepo, type Stage } from '../config.ts';
import { ADMIN_GROUP } from './admin-identity.ts';
import type { Events } from './events.ts';
import {
  GITHUB_APP_PARAMETERS,
  GITHUB_TOKEN_PARAMETER,
  LLM_PARAMETERS,
  type Secrets,
} from './secrets.ts';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const HANDLERS = `${REPO_ROOT}services/pipeline/src/handlers/`;

// an ESM bundle still contains CommonJS dependencies that call require()
const REQUIRE_SHIM =
  "import{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);";

export interface PipelineFunctionsProps {
  stage: Stage;
  table: Table;
  events: Events;
  secrets: Secrets;
  github: GitHubRepo;
}

interface FunctionSpec {
  name: string;
  timeout: Duration;
  memoryMb: number;
  environment?: Record<string, string>;
  // API Gateway invokes synchronously, where a DLQ and retry count mean nothing
  sync?: boolean;
}

export class PipelineFunctions extends Construct {
  readonly poll: NodejsFunction;
  readonly triage: NodejsFunction;
  readonly verify: NodejsFunction;
  readonly publish: NodejsFunction;
  readonly status: NodejsFunction;
  readonly api: NodejsFunction;
  readonly all: NodejsFunction[];

  private readonly stage: Stage;
  private readonly table: Table;
  private readonly deadLetterQueue: Queue;

  constructor(scope: Construct, id: string, props: PipelineFunctionsProps) {
    super(scope, id);
    this.stage = props.stage;
    this.table = props.table;
    this.deadLetterQueue = props.events.deadLetterQueue;
    const { github, events, secrets, table } = props;
    const userAgent = `cert-tracker/1.0 (+https://github.com/${github.owner}/${github.repo})`;
    const queueUrls = {
      TRIAGE_QUEUE_URL: events.triageQueue.queueUrl,
      VERIFY_QUEUE_URL: events.verifyQueue.queueUrl,
    };

    this.poll = this.pipelineFunction({
      name: 'poll',
      timeout: Duration.minutes(5),
      memoryMb: 512,
      environment: { USER_AGENT: userAgent, ...queueUrls },
    });
    table.grantReadWriteData(this.poll);
    events.triageQueue.grantSendMessages(this.poll);
    events.verifyQueue.grantSendMessages(this.poll);
    secrets.grantRead(this.poll, [GITHUB_TOKEN_PARAMETER]);
    this.schedule(
      'PollHourly',
      this.poll,
      ScheduleExpression.cron({ minute: '7', hour: '*', day: '*', month: '*', year: '*' }),
    );

    this.triage = this.pipelineFunction({
      name: 'triage',
      timeout: Duration.minutes(2),
      memoryMb: 256,
      environment: { VERIFY_QUEUE_URL: events.verifyQueue.queueUrl },
    });
    table.grantReadWriteData(this.triage);
    events.verifyQueue.grantSendMessages(this.triage);
    secrets.grantRead(this.triage, LLM_PARAMETERS);
    this.triage.addEventSource(
      new SqsEventSource(events.triageQueue, {
        batchSize: 10,
        maxConcurrency: 2,
        reportBatchItemFailures: true,
      }),
    );

    this.verify = this.pipelineFunction({
      name: 'verify',
      timeout: Duration.minutes(3),
      memoryMb: 512,
      environment: { USER_AGENT: userAgent },
    });
    table.grantReadWriteData(this.verify);
    secrets.grantRead(this.verify, LLM_PARAMETERS);
    this.verify.addEventSource(
      new SqsEventSource(events.verifyQueue, {
        batchSize: 1,
        maxConcurrency: 2,
        reportBatchItemFailures: true,
      }),
    );

    this.publish = this.pipelineFunction({
      name: 'publish',
      timeout: Duration.minutes(2),
      memoryMb: 256,
      environment: { GITHUB_OWNER: github.owner, GITHUB_REPO: github.repo },
    });
    table.grantReadWriteData(this.publish);
    secrets.grantRead(this.publish, GITHUB_APP_PARAMETERS);
    this.publish.addEventSource(
      // 2 is the floor SQS allows; the publish lease is what keeps commits one at a time
      new SqsEventSource(events.publishQueue, { batchSize: 10, maxConcurrency: 2 }),
    );
    this.schedule('PublishSweep', this.publish, ScheduleExpression.rate(Duration.minutes(15)));

    this.status = this.pipelineFunction({
      name: 'status',
      timeout: Duration.minutes(10),
      memoryMb: 512,
      environment: { USER_AGENT: userAgent },
    });
    table.grantReadWriteData(this.status);
    this.schedule(
      'StatusDaily',
      this.status,
      ScheduleExpression.cron({ minute: '17', hour: '4', day: '*', month: '*', year: '*' }),
    );

    this.api = this.pipelineFunction({
      name: 'api',
      // API Gateway gives up at 29 seconds; a read that slow is a bug worth seeing as a 500
      timeout: Duration.seconds(10),
      memoryMb: 256,
      environment: { ADMIN_GROUP },
      sync: true,
    });
    // read-only while the admin API only reads. The decision routes bring their own grant.
    table.grantReadData(this.api);

    this.all = [this.poll, this.triage, this.verify, this.publish, this.status, this.api];
  }

  private pipelineFunction(spec: FunctionSpec): NodejsFunction {
    const settings = stageSettings(this.stage);
    const functionName = resourceName(this.stage, spec.name);
    return new NodejsFunction(this, `${spec.name}Function`, {
      functionName,
      entry: `${HANDLERS}${spec.name}.ts`,
      handler: 'handler',
      runtime: Runtime.NODEJS_24_X,
      architecture: Architecture.ARM_64,
      timeout: spec.timeout,
      memorySize: spec.memoryMb,
      projectRoot: REPO_ROOT,
      depsLockFilePath: `${REPO_ROOT}package-lock.json`,
      bundling: {
        format: OutputFormat.ESM,
        target: 'node24',
        minify: true,
        sourceMap: true,
        // the SDK is bundled too: deterministic, and v3 is small once tree-shaken
        externalModules: [],
        mainFields: ['module', 'main'],
        banner: REQUIRE_SHIM,
        // prompt files ride inside the bundle as strings
        loader: { '.md': 'text' },
      },
      environment: {
        STAGE: this.stage,
        TABLE_NAME: this.table.tableName,
        POWERTOOLS_SERVICE_NAME: 'cert-tracker',
        NODE_OPTIONS: '--enable-source-maps',
        ...spec.environment,
      },
      logGroup: new LogGroup(this, `${spec.name}Logs`, {
        logGroupName: `/aws/lambda/${functionName}`,
        retention: settings.logRetention,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
      tracing: settings.isProd ? Tracing.ACTIVE : Tracing.DISABLED,
      // async invocations that exhaust their retries land in the shared DLQ
      ...(spec.sync === true ? {} : { deadLetterQueue: this.deadLetterQueue, retryAttempts: 2 }),
    });
  }

  private schedule(id: string, target: NodejsFunction, expression: ScheduleExpression): void {
    new Schedule(this, id, {
      scheduleName: resourceName(this.stage, id.toLowerCase()),
      schedule: expression,
      target: new LambdaInvoke(target, {
        retryAttempts: 2,
        deadLetterQueue: this.deadLetterQueue,
      }),
    });
  }
}
