import { expect, onTestFinished, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMockActionLogRecord } from './factories/build-mock-action-log-record.ts';
import { runLiveUse } from './run-live-use.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'live-use-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it writes the summary under runs/live-use with the run config and the log counts', async () => {
  const ctx = await setupTest();

  const logPath = join(ctx.dir, 'actions.jsonl');

  const text = `${JSON.stringify({ schemaVersion: 2, status: 'allow' })}\n${JSON.stringify(
    buildMockActionLogRecord({
      time: '2026-10-01T10:00:00.000Z',
      sessionHash: 'aaaaaaaaaaaaaaaa',
    }),
  )}\n`;

  await writeFile(logPath, text);

  const result = await runLiveUse({
    logPath,
    since: '2026-09-01T00:00:00.000Z',
    resultsDir: ctx.dir,
    publicCommit: 'abc123',
    dirtyTree: true,
    now: () => new Date('2026-10-10T12:00:00.000Z'),
  });

  const written = await readFile(
    join(ctx.dir, 'runs', 'live-use', result.summary.runID, 'summary.json'),
    'utf8',
  );

  expect(JSON.parse(written)).toStrictEqual({
    runID: expect.toSatisfy((value: string) => /^20261010T120000Z-[0-9a-f]{8}$/.test(value)),
    config: {
      schemaVersion: 1,
      experiment: 'live-use',
      publicCommit: 'abc123',
      dirtyTree: true,
      logHash: createHash('sha256').update(text).digest('hex'),
      recordSchemaVersion: 3,
      since: '2026-09-01T00:00:00.000Z',
      startedAt: '2026-10-10T12:00:00.000Z',
    },
    log: { lines: 2, skippedVersions: { '2': 1 }, beforeSince: 0, tornLineCharacters: null },
    measures: result.summary.measures,
  });
});

test('it keeps no log content beyond the hashed session identifiers', async () => {
  const ctx = await setupTest();

  const logPath = join(ctx.dir, 'private-path-canary.jsonl');

  await writeFile(
    logPath,
    `${JSON.stringify(
      buildMockActionLogRecord({
        invocationID: 'private-invocation-canary',
        actionHash: 'cccccccccccccccc',
        diagnostics: { contributors: [{ rule: 'private-rule-canary' }] },
      }),
    )}\n`,
  );

  const result = await runLiveUse({
    logPath,
    since: null,
    resultsDir: ctx.dir,
    publicCommit: 'abc123',
    dirtyTree: false,
    now: () => new Date('2026-10-10T12:00:00.000Z'),
  });

  const written = await readFile(join(result.runDir, 'summary.json'), 'utf8');

  expect(written).not.toInclude('private-');
  expect(written).not.toInclude('cccccccccccccccc');
});
