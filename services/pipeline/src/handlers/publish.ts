import { readPublishEnv } from '../lib/env.ts';
import { createGitHubSnapshotStore, type SnapshotStore } from '../lib/github.ts';
import {
  acquireLock,
  createDocClient,
  getSystemMeta,
  listCatalog,
  listOffers,
  listPublicEventsSince,
  listSources,
  newEvent,
  releaseLock,
  setSystemMeta,
  writeEventOnly,
  type DocClient,
} from '../lib/repo/index.ts';
import { readGitHubAppCredentials } from '../lib/secrets.ts';
import { buildSnapshot, eventTailStart, sameContent, serializeSnapshot } from '../lib/snapshot.ts';
import { count, flushMetrics, logger, tracer } from '../lib/telemetry.ts';

export const LOCK_NAME = 'publish';
export const LEASE_SECONDS = 120;
// Cloudflare's free tier allows 500 builds a month; this leaves room for PR previews
export const MONTHLY_COMMIT_CAP = 200;
const SCHEDULE_MINUTES = 15;
const SCHEDULE_SLACK_MS = 60_000;

export type PublishOutcome =
  'locked' | 'unchanged' | 'rate-limited' | 'capped' | 'identical' | 'committed';

export interface PublishDeps {
  doc: DocClient;
  table: string;
  store: SnapshotStore;
  now: () => Date;
}

export async function runPublish(deps: PublishDeps, urgent: boolean): Promise<PublishOutcome> {
  const { doc, table, store } = deps;
  const startedAt = deps.now();
  const lease = await acquireLock(doc, table, LOCK_NAME, LEASE_SECONDS, startedAt);
  if (lease === null) return 'locked';

  try {
    const meta = await getSystemMeta(doc, table);
    if (
      meta.lastChangeAt === null ||
      (meta.lastPublishedAt !== null && meta.lastChangeAt <= meta.lastPublishedAt)
    ) {
      return 'unchanged';
    }

    if (!urgent && meta.lastPublishedAt !== null) {
      const sinceLast = startedAt.getTime() - Date.parse(meta.lastPublishedAt);
      if (sinceLast < SCHEDULE_MINUTES * 60_000 - SCHEDULE_SLACK_MS) return 'rate-limited';
    }

    const month = startedAt.toISOString().slice(0, 7);
    const commitsThisMonth = meta.publishMonth === month ? meta.publishCountMonth : 0;
    count('PublishCountMonth', commitsThisMonth);
    if (commitsThisMonth >= MONTHLY_COMMIT_CAP) {
      logger.error('monthly snapshot commit cap reached; not publishing', { commitsThisMonth });
      return 'capped';
    }

    const [offers, catalog, events, sources] = await Promise.all([
      listOffers(doc, table),
      listCatalog(doc, table),
      listPublicEventsSince(doc, table, eventTailStart(startedAt)),
      listSources(doc, table),
    ]);
    const snapshot = buildSnapshot({ offers, catalog, events, sources, meta, now: startedAt });

    const published = await store.read();
    // startedAt, not now: anything written while we were reading must still look unpublished
    const publishedAt = startedAt.toISOString();
    if (published !== null && sameContent(snapshot, published.content)) {
      await setSystemMeta(doc, table, { lastPublishedAt: publishedAt });
      return 'identical';
    }

    const commitSha = await store.write(
      serializeSnapshot(snapshot),
      `data: snapshot ${publishedAt}`,
      published?.sha,
    );
    await setSystemMeta(doc, table, {
      lastPublishedAt: publishedAt,
      publishMonth: month,
      publishCountMonth: commitsThisMonth + 1,
    });
    count('PublishCountMonth', commitsThisMonth + 1);
    await writeEventOnly(
      doc,
      table,
      newEvent(
        {
          type: 'publish.completed',
          audience: 'admin',
          idempotencyKey: `publish#${publishedAt}`,
          payload: { commitSha, offers: offers.length, events: events.length },
        },
        deps.now(),
      ),
    );
    logger.info('snapshot committed', { commitSha, offers: offers.length, events: events.length });
    return 'committed';
  } finally {
    await releaseLock(doc, table, lease);
  }
}

let cached: Omit<PublishDeps, 'now'> | undefined;

async function dependencies(): Promise<Omit<PublishDeps, 'now'>> {
  if (cached !== undefined) return cached;
  const env = readPublishEnv();
  const credentials = await readGitHubAppCredentials(env.ssmPrefix);
  cached = {
    doc: tracer.captureAWSv3Client(createDocClient()),
    table: env.tableName,
    store: createGitHubSnapshotStore({
      credentials,
      owner: env.githubOwner,
      repo: env.githubRepo,
      branch: env.githubBranch,
      path: env.snapshotPath,
    }),
  };
  return cached;
}

// SQS deliveries are the urgent path (a new offer, a window opening); the schedule is the sweep
function isUrgent(event: unknown): boolean {
  return typeof event === 'object' && event !== null && 'Records' in event;
}

export async function handler(event: unknown): Promise<{ outcome: PublishOutcome }> {
  try {
    const deps = await dependencies();
    const outcome = await runPublish({ ...deps, now: () => new Date() }, isUrgent(event));
    logger.info('publish finished', { outcome });
    return { outcome };
  } catch (error) {
    logger.error('publish failed', { error });
    throw error;
  } finally {
    flushMetrics();
  }
}
