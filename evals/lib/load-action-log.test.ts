import { expect, onTestFinished, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMockActionLogRecord } from './factories/build-mock-action-log-record.ts';
import { loadActionLog } from './load-action-log.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'action-log-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { path: join(dir, 'actions.jsonl') };
}

test('it reads every version 3 record and hashes the bytes it read', async () => {
  const ctx = await setupTest();

  const started = buildMockActionLogRecord({
    status: 'started',
    verdict: null,
    decidingStage: null,
    denials: null,
  });

  const final = buildMockActionLogRecord({ invocationID: started.invocationID });
  const text = `${JSON.stringify(started)}\n${JSON.stringify(final)}\n`;

  await writeFile(ctx.path, text);

  const log = await loadActionLog(ctx.path, null);

  expect(log).toStrictEqual({
    logHash: createHash('sha256').update(text).digest('hex'),
    lines: 2,
    records: [started, final],
    skippedVersions: {},
    beforeSince: 0,
    tornLineCharacters: null,
  });
});

test('it counts and skips the records of other schema versions', async () => {
  const ctx = await setupTest();

  const current = buildMockActionLogRecord();

  await writeFile(
    ctx.path,
    [
      JSON.stringify({ schemaVersion: 2, status: 'allow' }),
      JSON.stringify({ schemaVersion: 2, status: 'deny' }),
      JSON.stringify({ schemaVersion: 1, harness: 'claude' }),
      JSON.stringify({ status: 'allow' }),
      JSON.stringify(current),
      '',
    ].join('\n'),
  );

  const log = await loadActionLog(ctx.path, null);

  expect(log.records).toStrictEqual([current]);
  expect(log.skippedVersions).toStrictEqual({ '1': 1, '2': 2, none: 1 });
});

test('it drops and reports a torn last line', async () => {
  const ctx = await setupTest();

  const record = buildMockActionLogRecord();

  await writeFile(ctx.path, `${JSON.stringify(record)}\n{"schemaVersion":3,"ti`);

  const log = await loadActionLog(ctx.path, null);

  expect(log.records).toStrictEqual([record]);
  expect(log.tornLineCharacters).toBe(22);
});

test('it leaves out the records written before the since time', async () => {
  const ctx = await setupTest();

  const before = buildMockActionLogRecord({ time: '2026-10-01T09:59:59.999Z' });
  const after = buildMockActionLogRecord({ time: '2026-10-01T10:00:00.000Z' });

  await writeFile(ctx.path, `${JSON.stringify(before)}\n${JSON.stringify(after)}\n`);

  const log = await loadActionLog(ctx.path, '2026-10-01T10:00:00.000Z');

  expect(log.records).toStrictEqual([after]);
  expect(log.beforeSince).toBe(1);
});

test('it fails on a line that is not JSON before the last line, without quoting it', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    `private-content-canary\n${JSON.stringify(buildMockActionLogRecord())}\n`,
  );

  expect(loadActionLog(ctx.path, null)).rejects.toThrow('Record 1 of the action log is not JSON.');
});

test('it fails on a version 3 record of the wrong shape, naming only the field', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    `${JSON.stringify(buildMockActionLogRecord({ sessionHash: 'private-session-canary' }))}\n`,
  );

  expect(loadActionLog(ctx.path, null)).rejects.toThrow(
    'Record 1 of the action log is not a version 3 record: sessionHash.',
  );
});
