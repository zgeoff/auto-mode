import { expect, onTestFinished, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGit } from './run-git.ts';

async function setupTest(): Promise<{ readonly dir: string }> {
  const created = await mkdtemp(join(tmpdir(), 'auto-mode-run-git-'));

  onTestFinished(() => rm(created, { recursive: true, force: true }));

  // git prints the real path of a git directory.
  return { dir: await realpath(created) };
}

test('it reads no global or system git config', async () => {
  const ctx = await setupTest();

  expect(runGit(ctx.dir, ['config', '--list', '--show-scope'])).toBe('');
});

test('it commits as the fixed test identity', async () => {
  const ctx = await setupTest();

  runGit(ctx.dir, ['init', '-q', '-b', 'main', join(ctx.dir, 'repo')]);
  runGit(ctx.dir, ['-C', join(ctx.dir, 'repo'), 'commit', '-q', '--allow-empty', '-m', 'init']);

  expect(
    runGit(ctx.dir, ['-C', join(ctx.dir, 'repo'), 'log', '-1', '--format=%an <%ae>|%cn <%ce>']),
  ).toBe('dev <dev@example.com>|dev <dev@example.com>\n');
});

test('it keeps a GIT_DIR in the parent environment from reaching git', async () => {
  const ctx = await setupTest();

  runGit(ctx.dir, ['init', '-q', '-b', 'main', join(ctx.dir, 'repo')]);
  runGit(ctx.dir, ['init', '-q', '-b', 'main', join(ctx.dir, 'other')]);

  const child = spawnSync(
    process.execPath,
    [
      '-e',
      `import { runGit } from ${JSON.stringify(join(import.meta.dir, 'run-git.ts'))};
       process.stdout.write(runGit(${JSON.stringify(join(ctx.dir, 'repo'))}, ['rev-parse', '--absolute-git-dir']));`,
    ],
    {
      cwd: ctx.dir,
      encoding: 'utf8',
      env: { PATH: process.env['PATH'], GIT_DIR: join(ctx.dir, 'other', '.git') },
    },
  );

  expect({ status: child.status, stdout: child.stdout, stderr: child.stderr }).toStrictEqual({
    status: 0,
    stdout: `${join(ctx.dir, 'repo', '.git')}\n`,
    stderr: '',
  });
});
