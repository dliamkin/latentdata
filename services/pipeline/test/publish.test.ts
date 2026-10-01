import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MONTHLY_COMMIT_CAP, runPublish, type PublishDeps } from '../src/handlers/publish.ts';
import type { SnapshotStore } from '../src/lib/github.ts';
import { catalogEntryToItem, offerToItem, sourceToItem } from '../src/lib/repo/index.ts';
import { buildSnapshot, serializeSnapshot } from '../src/lib/snapshot.ts';
import { TABLE, awsError, catalogEntry, docMock, offer, source } from './helpers.ts';

const NOW = new Date('2026-09-29T12:00:00.000Z');
const { doc, mock } = docMock();

function store(published: string | null): SnapshotStore & {
  read: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
} {
  return {
    read: vi.fn(() =>
      Promise.resolve(published === null ? null : { content: published, sha: 'old-sha' }),
    ),
    write: vi.fn(() => Promise.resolve('new-commit')),
  };
}

function deps(snapshotStore: SnapshotStore): PublishDeps {
  return { doc, table: TABLE, store: snapshotStore, now: () => NOW };
}

function arrange(meta: Record<string, unknown>): void {
  mock.on(PutCommand).resolves({});
  mock.on(DeleteCommand).resolves({});
  mock.on(UpdateCommand).resolves({});
  mock.on(TransactWriteCommand).resolves({});
  mock.on(GetCommand).resolves({ Item: meta });
  mock
    .on(QueryCommand)
    .callsFake((input: { ExpressionAttributeValues?: Record<string, unknown> }) => {
      switch (input.ExpressionAttributeValues?.[':pk']) {
        case 'OFFERS':
          return { Items: [offerToItem(offer())] };
        case 'SOURCES':
          return { Items: [sourceToItem(source())] };
        case 'CATALOG':
          return { Items: [catalogEntryToItem(catalogEntry())] };
        default:
          return { Items: [] };
      }
    });
}

const CHANGED = {
  lastChangeAt: '2026-09-29T11:00:00.000Z',
  lastPublishedAt: '2026-09-29T10:00:00.000Z',
};

beforeEach(() => {
  mock.reset();
});

describe('runPublish', () => {
  it('steps aside when another run holds the lease', async () => {
    mock.on(PutCommand).rejects(awsError('ConditionalCheckFailedException'));
    const s = store(null);
    expect(await runPublish(deps(s), false)).toBe('locked');
    expect(s.read).not.toHaveBeenCalled();
  });

  it.each([
    ['nothing has ever changed', {}],
    [
      'the last change is already published',
      { lastChangeAt: '2026-09-29T09:00:00.000Z', lastPublishedAt: '2026-09-29T10:00:00.000Z' },
    ],
  ])('exits when %s, and releases the lease', async (_name, meta) => {
    arrange(meta);
    const s = store(null);
    expect(await runPublish(deps(s), false)).toBe('unchanged');
    expect(s.read).not.toHaveBeenCalled();
    expect(mock.commandCalls(DeleteCommand)).toHaveLength(1);
  });

  it('holds a scheduled run to one commit per fifteen minutes, but not an urgent one', async () => {
    const recent = {
      lastChangeAt: '2026-09-29T11:59:00.000Z',
      lastPublishedAt: '2026-09-29T11:55:00.000Z',
    };
    arrange(recent);
    expect(await runPublish(deps(store(null)), false)).toBe('rate-limited');
    arrange(recent);
    expect(await runPublish(deps(store(null)), true)).toBe('committed');
  });

  it('fails closed at the monthly cap', async () => {
    arrange({ ...CHANGED, publishMonth: '2026-09', publishCountMonth: MONTHLY_COMMIT_CAP });
    const s = store(null);
    expect(await runPublish(deps(s), true)).toBe('capped');
    expect(s.write).not.toHaveBeenCalled();
  });

  it('starts the count again in a new month', async () => {
    arrange({ ...CHANGED, publishMonth: '2026-08', publishCountMonth: MONTHLY_COMMIT_CAP });
    expect(await runPublish(deps(store(null)), true)).toBe('committed');
    const update = mock.commandCalls(UpdateCommand)[0]?.args[0].input;
    expect(update?.ExpressionAttributeValues).toMatchObject({ ':v1': '2026-09', ':v2': 1 });
  });

  it('skips the commit when the published file already says the same thing', async () => {
    arrange(CHANGED);
    const same = serializeSnapshot(
      buildSnapshot({
        offers: [offer()],
        catalog: [catalogEntry()],
        events: [],
        sources: [source()],
        meta: { lastPollAt: null, lastStatusRunAt: null },
        now: new Date('2026-09-28T00:00:00.000Z'),
      }),
    );
    const s = store(same);
    expect(await runPublish(deps(s), false)).toBe('identical');
    expect(s.write).not.toHaveBeenCalled();
    expect(
      mock.commandCalls(UpdateCommand)[0]?.args[0].input.ExpressionAttributeValues,
    ).toMatchObject({
      ':v0': NOW.toISOString(),
    });
  });

  it('commits over the previous sha, records the run and emits an admin event', async () => {
    arrange({ ...CHANGED, publishMonth: '2026-09', publishCountMonth: 3 });
    const s = store('{"schemaVersion":1}');
    expect(await runPublish(deps(s), false)).toBe('committed');

    const [content, message, sha] = s.write.mock.calls[0] as [string, string, string];
    expect(message).toBe(`data: snapshot ${NOW.toISOString()}`);
    expect(sha).toBe('old-sha');
    expect(JSON.parse(content)).toMatchObject({
      schemaVersion: 1,
      offers: [{ id: offer().id }],
      catalog: [{ id: catalogEntry().id }],
    });
    expect(content.endsWith('\n')).toBe(true);

    expect(
      mock.commandCalls(UpdateCommand)[0]?.args[0].input.ExpressionAttributeValues,
    ).toMatchObject({
      ':v0': NOW.toISOString(),
      ':v1': '2026-09',
      ':v2': 4,
    });
    const items = mock.commandCalls(TransactWriteCommand)[0]?.args[0].input.TransactItems;
    expect(items).toHaveLength(2);
    expect(items?.[1]?.Put?.Item).toMatchObject({
      type: 'publish.completed',
      audience: 'admin',
      payload: { commitSha: 'new-commit', offers: 1 },
    });
    expect(mock.commandCalls(DeleteCommand)).toHaveLength(1);
  });

  it('releases the lease when the commit fails', async () => {
    arrange(CHANGED);
    const s = store(null);
    s.write.mockRejectedValueOnce(new Error('github is down'));
    await expect(runPublish(deps(s), false)).rejects.toThrow('github is down');
    expect(mock.commandCalls(DeleteCommand)).toHaveLength(1);
    expect(mock.commandCalls(UpdateCommand)).toHaveLength(0);
  });
});
