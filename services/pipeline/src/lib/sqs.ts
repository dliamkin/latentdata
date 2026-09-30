import { SQSClient, SendMessageBatchCommand } from '@aws-sdk/client-sqs';

import { AdapterError } from './errors.ts';

const BATCH_MAX = 10;

export interface QueueMessage {
  id: string;
  body: string;
}

export interface QueueSender {
  send: (queueUrl: string, messages: readonly QueueMessage[]) => Promise<void>;
}

export function createQueueSender(client: SQSClient = new SQSClient({})): QueueSender {
  return {
    send: async (queueUrl, messages) => {
      for (let i = 0; i < messages.length; i += BATCH_MAX) {
        const batch = messages.slice(i, i + BATCH_MAX);
        const result = await client.send(
          new SendMessageBatchCommand({
            QueueUrl: queueUrl,
            Entries: batch.map((m) => ({ Id: m.id, MessageBody: m.body })),
          }),
        );
        const failed = result.Failed ?? [];
        if (failed.length > 0) {
          throw new AdapterError('sqs', 'http', `${String(failed.length)} messages not queued`, {
            retryable: true,
          });
        }
      }
    },
  };
}
