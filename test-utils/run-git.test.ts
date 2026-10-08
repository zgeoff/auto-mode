import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGit } from './run-git.ts';

async function setupTest(): Promise<{ readonly dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-run-git-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
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
