import { Duration } from 'aws-cdk-lib';
import { SubscriptionFilter, Topic } from 'aws-cdk-lib/aws-sns';
import { SqsSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

import { resourceName, type Stage } from '../config.ts';

const MAX_RECEIVES = 3;
// the two event types worth an immediate site rebuild; everything else waits for the sweep
const URGENT_PUBLISH_TYPES = ['offer.discovered', 'offer.window_opened'];

export class Events extends Construct {
  readonly topic: Topic;
  readonly deadLetterQueue: Queue;
  readonly notifyQueue: Queue;
  readonly publishQueue: Queue;
  // fed by poll and triage directly, not by the topic: signals are pipeline work, not events
  readonly triageQueue: Queue;
  readonly verifyQueue: Queue;

  constructor(scope: Construct, id: string, props: { stage: Stage }) {
    super(scope, id);
    const { stage } = props;

    // one DLQ for every queue and every async invocation means one alarm metric; SQS stamps
    // each redriven message with DeadLetterQueueSourceArn, which says where it came from
    this.deadLetterQueue = new Queue(this, 'DeadLetters', {
      queueName: resourceName(stage, 'dlq'),
      retentionPeriod: Duration.days(14),
      encryption: QueueEncryption.SQS_MANAGED,
      enforceSSL: true,
    });

    this.topic = new Topic(this, 'Topic', {
      topicName: resourceName(stage, 'events'),
      enforceSSL: true,
    });

    this.notifyQueue = this.consumerQueue('Notify', resourceName(stage, 'notify'), 1);
    this.publishQueue = this.consumerQueue('Publish', resourceName(stage, 'publish'), 2);
    this.triageQueue = this.consumerQueue('Triage', resourceName(stage, 'triage'), 2);
    this.verifyQueue = this.consumerQueue('Verify', resourceName(stage, 'verify'), 3);

    this.topic.addSubscription(new SqsSubscription(this.notifyQueue, { rawMessageDelivery: true }));
    this.topic.addSubscription(
      new SqsSubscription(this.publishQueue, {
        rawMessageDelivery: true,
        // publish.completed is an admin event, so the publisher can never wake itself
        filterPolicy: {
          audience: SubscriptionFilter.stringFilter({ allowlist: ['public'] }),
          type: SubscriptionFilter.stringFilter({ allowlist: URGENT_PUBLISH_TYPES }),
        },
      }),
    );
  }

  // visibility is six times the consumer's timeout, the ratio Lambda asks for so a message
  // isn't redelivered while its first attempt is still running
  consumerQueue(id: string, queueName: string, consumerTimeoutMinutes: number): Queue {
    return new Queue(this, id, {
      queueName,
      visibilityTimeout: Duration.minutes(consumerTimeoutMinutes * 6),
      encryption: QueueEncryption.SQS_MANAGED,
      enforceSSL: true,
      deadLetterQueue: { queue: this.deadLetterQueue, maxReceiveCount: MAX_RECEIVES },
    });
  }
}
