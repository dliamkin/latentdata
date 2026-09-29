import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';

import { AdapterError } from './errors.ts';
import { withRetry } from './retry.ts';
import type { GitHubAppCredentials } from './secrets.ts';

export interface RepoFile {
  content: string;
  sha: string;
}

// what the publisher needs from wherever the snapshot lives; GitHub is the only implementation
export interface SnapshotStore {
  read: () => Promise<RepoFile | null>;
  write: (content: string, message: string, previousSha: string | undefined) => Promise<string>;
}

export interface GitHubStoreConfig {
  credentials: GitHubAppCredentials;
  owner: string;
  repo: string;
  branch: string;
  path: string;
  timeoutMs?: number;
}

const ADAPTER = 'github';
const DEFAULT_TIMEOUT_MS = 15_000;
const RETRY = { attempts: 3, baseDelayMs: 500, maxDelayMs: 4000 };

function statusOf(error: unknown): number | undefined {
  const status: unknown = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : undefined;
}

function toAdapterError(action: string, error: unknown): AdapterError {
  const status = statusOf(error);
  if (status === undefined) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    return new AdapterError(ADAPTER, timedOut ? 'timeout' : 'network', `${action} failed`, {
      retryable: true,
      cause: error,
    });
  }
  if (status === 409 || status === 422) {
    // the file moved under us; the next run rebuilds against the new sha
    return new AdapterError(ADAPTER, 'conflict', `${action} conflicted`, {
      retryable: false,
      status,
      cause: error,
    });
  }
  if (status === 403 || status === 429) {
    return new AdapterError(ADAPTER, 'rate-limited', `${action} was rate limited`, {
      retryable: false,
      status,
      cause: error,
    });
  }
  return new AdapterError(ADAPTER, 'http', `${action} returned ${String(status)}`, {
    retryable: status >= 500,
    status,
    cause: error,
  });
}

export function createGitHubSnapshotStore(config: GitHubStoreConfig): SnapshotStore {
  const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: config.credentials.appId,
      installationId: config.credentials.installationId,
      privateKey: config.credentials.privateKey,
    },
  });
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const target = { owner: config.owner, repo: config.repo, path: config.path };

  return {
    read: () =>
      withRetry(async () => {
        try {
          const { data } = await octokit.rest.repos.getContent({
            ...target,
            ref: config.branch,
            request: { signal: AbortSignal.timeout(timeoutMs) },
          });
          if (Array.isArray(data) || data.type !== 'file') {
            throw new AdapterError(ADAPTER, 'invalid-response', `${config.path} is not a file`, {
              retryable: false,
            });
          }
          return {
            content: Buffer.from(data.content, 'base64').toString('utf8'),
            sha: data.sha,
          };
        } catch (error) {
          if (error instanceof AdapterError) throw error;
          if (statusOf(error) === 404) return null;
          throw toAdapterError('read snapshot', error);
        }
      }, RETRY),

    write: (content, message, previousSha) =>
      withRetry(async () => {
        try {
          const { data } = await octokit.rest.repos.createOrUpdateFileContents({
            ...target,
            branch: config.branch,
            message,
            content: Buffer.from(content, 'utf8').toString('base64'),
            ...(previousSha === undefined ? {} : { sha: previousSha }),
            request: { signal: AbortSignal.timeout(timeoutMs) },
          });
          return data.commit.sha ?? '';
        } catch (error) {
          throw toAdapterError('commit snapshot', error);
        }
      }, RETRY),
  };
}
