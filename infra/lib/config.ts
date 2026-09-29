import { readFileSync } from 'node:fs';

import { RemovalPolicy } from 'aws-cdk-lib';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';

export const STAGES = ['prod', 'dev'] as const;
export type Stage = (typeof STAGES)[number];

export interface StageConfig {
  siteOrigins: string[];
  apiDomainName: string | null;
  // requested by hand in the stack's region; CDK can't validate a certificate without a zone
  apiCertificateArn: string | null;
  // new accounts already have a default services monitor and a second one fails to create
  costAnomalyMonitor: boolean;
}

export interface GitHubRepo {
  owner: string;
  repo: string;
}

export function parseStage(value: unknown): Stage {
  if (typeof value === 'string' && (STAGES as readonly string[]).includes(value)) {
    return value as Stage;
  }
  throw new Error(`pass -c stage=<${STAGES.join('|')}>; got ${JSON.stringify(value)}`);
}

export function requireString(value: unknown, what: string): string {
  if (typeof value === 'string' && value !== '') return value;
  throw new Error(`missing ${what}`);
}

export function loadStageConfig(stage: Stage): StageConfig {
  const raw: unknown = JSON.parse(
    readFileSync(new URL(`../config/${stage}.json`, import.meta.url), 'utf8'),
  );
  if (typeof raw !== 'object' || raw === null) throw new Error(`config/${stage}.json is empty`);
  const config = raw as Partial<StageConfig>;
  if (!Array.isArray(config.siteOrigins) || config.siteOrigins.length === 0) {
    throw new Error(`config/${stage}.json needs siteOrigins`);
  }
  return {
    siteOrigins: config.siteOrigins,
    apiDomainName: config.apiDomainName ?? null,
    apiCertificateArn: config.apiCertificateArn ?? null,
    costAnomalyMonitor: config.costAnomalyMonitor ?? false,
  };
}

export interface StageSettings {
  isProd: boolean;
  logRetention: RetentionDays;
  removalPolicy: RemovalPolicy;
}

// everything that differs between stages, in one place; nothing else branches on the stage
export function stageSettings(stage: Stage): StageSettings {
  const isProd = stage === 'prod';
  return {
    isProd,
    logRetention: isProd ? RetentionDays.TWO_WEEKS : RetentionDays.THREE_DAYS,
    removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
  };
}

export function resourceName(stage: Stage, suffix?: string): string {
  return suffix === undefined ? `cert-tracker-${stage}` : `cert-tracker-${stage}-${suffix}`;
}
