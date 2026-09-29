import { Logger } from '@aws-lambda-powertools/logger';
import { MetricUnit, Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';

const SERVICE = 'cert-tracker';

// the whole system gets ten custom metrics (the CloudWatch free tier); every function shares one
// service name and the single `stage` dimension so each name below is exactly one metric
export const METRIC_NAMES = [
  'SignalsNew',
  'TriageRelevant',
  'OffersDiscovered',
  'NotificationsSent',
  'NotificationsFailed',
  'LlmCostUsd',
  'LlmBudgetSkipped',
  'SourcesUnhealthy',
  'PublishCountMonth',
  'ApiAuthFailures',
] as const;

export type MetricName = (typeof METRIC_NAMES)[number];

export const logger = new Logger({ serviceName: SERVICE });

export const metrics = new Metrics({
  namespace: SERVICE,
  serviceName: SERVICE,
  defaultDimensions: { stage: process.env.STAGE ?? 'unknown' },
});

export const tracer = new Tracer({ serviceName: SERVICE });

export function count(name: MetricName, value = 1): void {
  metrics.addMetric(name, MetricUnit.Count, value);
}

export function flushMetrics(): void {
  metrics.publishStoredMetrics();
}
