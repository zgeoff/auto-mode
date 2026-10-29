import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMockHostEnvironment } from '../../test-utils/factories/build-mock-host-environment.ts';
import { writeJudgeUsage } from './write-judge-usage.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'judge-usage-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it appends one line per call with the time and the usage to the file the debug path names', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'debug', 'judge.jsonl');

  const host = buildMockHostEnvironment({
    env: { AUTO_MODE_DEBUG_PATH: path },
    home: ctx.directory,
  });

  await writeJudgeUsage(
    {
      model: 'claude-sonnet-5-5',
      answeringModel: 'claude-sonnet-5-5',
      modelUsage: { 'claude-haiku-5-5': { outputTokens: 900 } },
    },
    host,
    { write: mock() },
  );

  await writeJudgeUsage(
    {
      model: 'claude-sonnet-5-5',
      answeringModel: 'claude-sonnet-5',
      modelUsage: { 'claude-sonnet-5': { outputTokens: 120 } },
    },
    host,
    { write: mock() },
  );

  const text = await readFile(path, 'utf8');

  expect(
    text
      .trim()
      .split('\n')
      .map((line): unknown => JSON.parse(line)),
  ).toStrictEqual([
    {
      time: expect.toBeDateString(),
      model: 'claude-sonnet-5-5',
      answeringModel: 'claude-sonnet-5-5',
      modelUsage: { 'claude-haiku-5-5': { outputTokens: 900 } },
    },
    {
      time: expect.toBeDateString(),
      model: 'claude-sonnet-5-5',
      answeringModel: 'claude-sonnet-5',
      modelUsage: { 'claude-sonnet-5': { outputTokens: 120 } },
    },
  ]);
});

test('it creates the debug file readable by its owner only', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'judge.jsonl');

  await writeJudgeUsage(
    { model: 'claude-sonnet-5-5', answeringModel: 'claude-sonnet-5-5', modelUsage: {} },
    buildMockHostEnvironment({ env: { AUTO_MODE_DEBUG_PATH: path }, home: ctx.directory }),
    { write: mock() },
  );

  const info = await stat(path);

  expect(info.mode & 0o777).toBe(0o600);
});

test.each([
  ['an unset debug path', {}],
  ['an empty debug path', { AUTO_MODE_DEBUG_PATH: '' }],
])('it writes nothing for %s', async (_label, env) => {
  const ctx = await setupTest();

  const warnings = { write: mock() };

  await writeJudgeUsage(
    { model: 'claude-sonnet-5-5', answeringModel: 'claude-sonnet-5-5', modelUsage: {} },
    buildMockHostEnvironment({ env, home: ctx.directory }),
    warnings,
  );

  const entries = await readdir(ctx.directory);

  expect(entries).toStrictEqual([]);
  expect(warnings.write).not.toHaveBeenCalled();
});

test('it warns on the warnings stream when the debug file cannot be written', async () => {
  const ctx = await setupTest();

  const warnings = { write: mock() };
  const blocker = join(ctx.directory, 'not-a-directory');

  await writeFile(blocker, '');

  await writeJudgeUsage(
    { model: 'claude-sonnet-5-5', answeringModel: 'claude-sonnet-5-5', modelUsage: {} },
    buildMockHostEnvironment({
      env: { AUTO_MODE_DEBUG_PATH: join(blocker, 'judge.jsonl') },
      home: ctx.directory,
    }),
    warnings,
  );

  expect(warnings.write).toHaveBeenCalledExactlyOnceWith(
    'auto-mode: judge debug line unavailable\n',
  );
});
