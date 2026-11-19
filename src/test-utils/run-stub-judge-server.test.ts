import { expect, onTestFinished, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'auto-mode-stub-judge-server-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it serves on the socket it is given, records its pid, and ends after its idle period', async () => {
  const ctx = await setupTest();

  const recordPath = join(ctx.directory, 'servers.jsonl');

  const result = spawnSync(
    process.execPath,
    [
      join(import.meta.dir, 'run-stub-judge-server.ts'),
      'judge-server',
      join(ctx.directory, 'j.sock'),
    ],
    {
      encoding: 'utf8',
      env: { STUB_JUDGE_SERVER_RECORD: recordPath, STUB_JUDGE_SERVER_IDLE_MS: '50' },
      timeout: 10_000,
    },
  );

  const recorded = await readFile(recordPath, 'utf8');

  expect(result.status).toBe(0);
  expect(JSON.parse(recorded)).toStrictEqual({ pid: result.pid });
  expect(existsSync(join(ctx.directory, 'j.sock'))).toBeFalse();
});

test('it exits 2 without the judge-server command', () => {
  const result = spawnSync(process.execPath, [join(import.meta.dir, 'run-stub-judge-server.ts')], {
    encoding: 'utf8',
    env: {},
    timeout: 10_000,
  });

  expect(result.status).toBe(2);
});
