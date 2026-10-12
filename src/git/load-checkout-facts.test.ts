import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGit } from '../../test-utils/run-git.ts';
import { findCheckout } from './find-checkout.ts';
import { loadCheckoutFacts } from './load-checkout-facts.ts';

async function setupTest() {
  const created = await mkdtemp(join(tmpdir(), 'auto-mode-checkout-facts-'));

  onTestFinished(() => rm(created, { recursive: true, force: true }));

  return { dir: await realpath(created) };
}

test('it reads the checkout, its branches and its remotes from one walk', async () => {
  const ctx = await setupTest();

  const repo = join(ctx.dir, 'app');
  const worktree = join(repo, '.worktrees', 'feature');

  runGit(ctx.dir, ['init', '-q', '-b', 'main', repo]);
  runGit(ctx.dir, ['-C', repo, 'remote', 'add', 'origin', 'git@github.com:dev/app.git']);
  runGit(ctx.dir, ['-C', repo, 'commit', '-q', '--allow-empty', '-m', 'init']);
  runGit(ctx.dir, ['-C', repo, 'worktree', 'add', '-q', '-b', 'feature', worktree]);

  await mkdir(join(repo, '.git', 'refs', 'remotes', 'origin'), { recursive: true });

  await writeFile(
    join(repo, '.git', 'refs', 'remotes', 'origin', 'HEAD'),
    'ref: refs/remotes/origin/main\n',
  );

  const find = mock(findCheckout);

  const facts = await loadCheckoutFacts(join(worktree, 'src', '..'), {}, { findCheckout: find });

  expect(facts).toStrictEqual({
    cwd: worktree,
    checkout: {
      worktree,
      gitDir: join(repo, '.git', 'worktrees', 'feature'),
      commonDir: join(repo, '.git'),
    },
    head: { branch: 'feature', defaultBranch: 'main' },
    remotes: [{ name: 'origin', url: 'git@github.com:dev/app.git' }],
  });

  expect(find).toHaveBeenCalledOnce();
});

test('it reads no facts outside a checkout', async () => {
  const ctx = await setupTest();
  const facts = await loadCheckoutFacts(ctx.dir, {}, { stopDir: ctx.dir });

  expect(facts).toStrictEqual({ cwd: ctx.dir, checkout: null, head: null, remotes: [] });
});

test('it keeps the checkout and its remotes when HEAD cannot be read', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, '.git'));
  await writeFile(join(ctx.dir, '.git', 'config'), '[remote "origin"]\n\turl = https://x/y.git\n');

  const facts = await loadCheckoutFacts(ctx.dir, {}, { stopDir: ctx.dir });

  expect(facts).toStrictEqual({
    cwd: ctx.dir,
    checkout: {
      worktree: ctx.dir,
      gitDir: join(ctx.dir, '.git'),
      commonDir: join(ctx.dir, '.git'),
    },
    head: null,
    remotes: [{ name: 'origin', url: 'https://x/y.git' }],
  });
});
