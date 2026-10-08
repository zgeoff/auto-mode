import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAtcSessionRecord } from './load-atc-session-record.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'atc-record-'));

  onTestFinished(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const record = {
    format: 'atc.session-record',
    version: 1,
    session: 'atc-1',
    daemonID: 'daemon-1',
    target: 'local',
    revision: 2,
    updatedAt: '2026-10-08T00:00:00.000Z',
    identity: { later: true },
    scope: {
      workspace: {
        path: '/repo/.worktrees/feat',
        branch: 'feat',
        repoURL: 'https://x',
        sha: 'abc',
      },
      worktrees: [{ path: '/repo/.worktrees/extra', branch: 'extra' }],
      branches: [{ name: 'later', repo: '/repo' }],
      pullRequests: [{ repo: 'dev/app', number: 12, url: 'https://x/12', branch: 'feat' }],
    },
  };

  return { dir, path: join(dir, 'record.json'), record };
}

test('it reads a version 1 record and ignores the keys it does not know', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.path, JSON.stringify(ctx.record));

  const loaded = await loadAtcSessionRecord(ctx.path, 'atc-1');

  expect(loaded).toStrictEqual({
    kind: 'record',
    record: {
      format: 'atc.session-record',
      version: 1,
      session: 'atc-1',
      scope: {
        workspace: { path: '/repo/.worktrees/feat', branch: 'feat' },
        worktrees: [{ path: '/repo/.worktrees/extra', branch: 'extra' }],
        branches: [{ name: 'later', repo: '/repo' }],
        pullRequests: [{ repo: 'dev/app', number: 12, url: 'https://x/12', branch: 'feat' }],
      },
    },
  });
});

test('it reports no record when the variable is unset or empty, or the file is missing', async () => {
  const ctx = await setupTest();

  const loads = await Promise.all([
    loadAtcSessionRecord(undefined, undefined),
    loadAtcSessionRecord('', 'atc-1'),
    loadAtcSessionRecord(ctx.path, 'atc-1'),
  ]);

  expect(loads).toStrictEqual([{ kind: 'absent' }, { kind: 'absent' }, { kind: 'absent' }]);
});

test('it gives one diagnostic for a record that is not JSON, another version, or not this session', async () => {
  const ctx = await setupTest();

  const files = ['broken.json', 'v2.json', 'other.json'].map((file) => join(ctx.dir, file));

  await Promise.all([
    writeFile(files[0] ?? '', '{"format":'),
    writeFile(files[1] ?? '', JSON.stringify({ ...ctx.record, version: 2 })),
    writeFile(files[2] ?? '', JSON.stringify({ ...ctx.record, session: 'atc-2' })),
  ]);

  const loads = await Promise.all(files.map((file) => loadAtcSessionRecord(file, 'atc-1')));
  const relative = await loadAtcSessionRecord('record.json', 'atc-1');

  await writeFile(ctx.path, JSON.stringify(ctx.record));

  const unmatched = await loadAtcSessionRecord(ctx.path, undefined);

  expect([...loads, relative, unmatched]).toStrictEqual([
    { kind: 'malformed', diagnostic: `atc session record is not JSON: ${files[0]}` },
    {
      kind: 'malformed',
      diagnostic: `atc session record ignored: version does not match version 1: ${files[1]}`,
    },
    {
      kind: 'malformed',
      diagnostic: `atc session record belongs to another session: ${files[2]}`,
    },
    { kind: 'malformed', diagnostic: 'atc session record path is not absolute: record.json' },
    { kind: 'malformed', diagnostic: `atc session record has no session to match: ${ctx.path}` },
  ]);
});
