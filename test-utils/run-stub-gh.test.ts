import { expect, onTestFinished, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-stub-gh-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { statePath: join(dir, 'pull-requests.json') };
}

test('it prints the head and creation time of a pull request it holds as one tab-separated row', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.statePath,
    JSON.stringify([
      {
        repository: 'github.com/dev/app',
        number: 12,
        headRefName: 'feat/a',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]),
  );

  const result = spawnSync(
    process.execPath,
    [
      join(import.meta.dir, 'run-stub-gh.ts'),
      ctx.statePath,
      'pr',
      'view',
      '12',
      '--repo',
      'github.com/dev/app',
      '--json',
      'headRefName,createdAt',
      '--jq',
      '[.headRefName, .createdAt] | @tsv',
    ],
    { encoding: 'utf8' },
  );

  expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toStrictEqual({
    status: 0,
    stdout: 'feat/a\t2026-01-01T00:00:00Z\n',
    stderr: '',
  });
});

test('it fails like gh for a pull request number it does not hold in the named repository', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.statePath,
    JSON.stringify([
      {
        repository: 'github.com/dev/lib',
        number: 12,
        headRefName: 'feat/a',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]),
  );

  const result = spawnSync(
    process.execPath,
    [
      join(import.meta.dir, 'run-stub-gh.ts'),
      ctx.statePath,
      'pr',
      'view',
      '12',
      '--repo',
      'github.com/dev/app',
      '--json',
      'headRefName,createdAt',
      '--jq',
      '[.headRefName, .createdAt] | @tsv',
    ],
    { encoding: 'utf8' },
  );

  expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toStrictEqual({
    status: 1,
    stdout: '',
    stderr:
      'GraphQL: Could not resolve to a PullRequest with the number of 12. (repository.pullRequest)\n',
  });
});

test('it fails for a call whose arguments are not the pull request view it models', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.statePath,
    JSON.stringify([
      {
        repository: 'github.com/dev/app',
        number: 12,
        headRefName: 'feat/a',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]),
  );

  const result = spawnSync(
    process.execPath,
    [
      join(import.meta.dir, 'run-stub-gh.ts'),
      ctx.statePath,
      'pr',
      'view',
      '12',
      '--repo',
      'github.com/dev/app',
      '--json',
      'headRefName',
      '--jq',
      '.headRefName',
    ],
    { encoding: 'utf8' },
  );

  expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toStrictEqual({
    status: 1,
    stdout: '',
    stderr:
      'unknown command or flags: gh pr view 12 --repo github.com/dev/app --json headRefName --jq .headRefName\n',
  });
});

test('it prints its row only once the delay a pull request names has passed', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.statePath,
    JSON.stringify([
      {
        repository: 'github.com/dev/app',
        number: 12,
        headRefName: 'feat/a',
        createdAt: '2026-01-01T00:00:00Z',
        delayMs: 50,
      },
    ]),
  );

  const startedAt = performance.now();

  const result = spawnSync(
    process.execPath,
    [
      join(import.meta.dir, 'run-stub-gh.ts'),
      ctx.statePath,
      'pr',
      'view',
      '12',
      '--repo',
      'github.com/dev/app',
      '--json',
      'headRefName,createdAt',
      '--jq',
      '[.headRefName, .createdAt] | @tsv',
    ],
    { encoding: 'utf8' },
  );

  const elapsedMs = performance.now() - startedAt;

  expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toStrictEqual({
    status: 0,
    stdout: 'feat/a\t2026-01-01T00:00:00Z\n',
    stderr: '',
  });

  expect(elapsedMs).toBeGreaterThanOrEqual(50);
});

test('it fails without the path of its pull request file', () => {
  const result = spawnSync(process.execPath, [join(import.meta.dir, 'run-stub-gh.ts')], {
    encoding: 'utf8',
  });

  expect(result.status).toBe(1);
  expect(result.stderr).toInclude('run-stub-gh needs the path of its pull request file');
});

test('it exits with the code a pull request names after printing its row', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.statePath,
    JSON.stringify([
      {
        repository: 'github.com/dev/app',
        number: 12,
        headRefName: 'feat/a',
        createdAt: '2026-01-01T00:00:00Z',
        exitCode: 4,
      },
    ]),
  );

  const result = spawnSync(
    process.execPath,
    [
      join(import.meta.dir, 'run-stub-gh.ts'),
      ctx.statePath,
      'pr',
      'view',
      '12',
      '--repo',
      'github.com/dev/app',
      '--json',
      'headRefName,createdAt',
      '--jq',
      '[.headRefName, .createdAt] | @tsv',
    ],
    { encoding: 'utf8' },
  );

  expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toStrictEqual({
    status: 4,
    stdout: 'feat/a\t2026-01-01T00:00:00Z\n',
    stderr: '',
  });
});
