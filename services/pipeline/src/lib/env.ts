export interface BaseEnv {
  stage: string;
  tableName: string;
  // `/cert-tracker/<stage>`; every secret and tunable hangs off it
  ssmPrefix: string;
}

export interface PublishEnv extends BaseEnv {
  githubOwner: string;
  githubRepo: string;
  githubBranch: string;
  snapshotPath: string;
}

type Source = Record<string, string | undefined>;

function required(source: Source, name: string): string {
  const value = source[name];
  if (value === undefined || value === '') {
    throw new Error(`missing environment variable ${name}`);
  }
  return value;
}

export function readBaseEnv(source: Source = process.env): BaseEnv {
  const stage = required(source, 'STAGE');
  return { stage, tableName: required(source, 'TABLE_NAME'), ssmPrefix: `/cert-tracker/${stage}` };
}

export function readPublishEnv(source: Source = process.env): PublishEnv {
  return {
    ...readBaseEnv(source),
    githubOwner: required(source, 'GITHUB_OWNER'),
    githubRepo: required(source, 'GITHUB_REPO'),
    githubBranch: source.GITHUB_BRANCH ?? 'main',
    snapshotPath: source.SNAPSHOT_PATH ?? 'apps/web/src/data/snapshot.json',
  };
}

export interface ApiEnv extends BaseEnv {
  // the Cognito group a token must be in; the pool and this name are set together in infra
  adminGroup: string;
}

export function readApiEnv(source: Source = process.env): ApiEnv {
  return { ...readBaseEnv(source), adminGroup: required(source, 'ADMIN_GROUP') };
}
