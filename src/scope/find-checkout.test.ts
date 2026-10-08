import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGit } from '../../test-utils/run-git.ts';
import { findCheckout } from './find-checkout.ts';

async function setupTest() {
  const created = await mkdtemp(join(tmpdir(), 'auto-mode-find-checkout-'));
  const dir = await realpath(created);

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it finds the checkout whose .git directory sits in the start directory', async () => {
  const ctx = await setupTest();

  runGit(ctx.dir, ['init', '--quiet', 'app']);

  const checkout = await findCheckout(join(ctx.dir, 'app'), {});

  expect(checkout).toStrictEqual({
    worktree: join(ctx.dir, 'app'),
    commonDir: join(ctx.dir, 'app', '.git'),
  });
});

test('it walks up from a subdirectory to the checkout that holds it', async () => {
  const ctx = await setupTest();

  runGit(ctx.dir, ['init', '--quiet', 'app']);

  await mkdir(join(ctx.dir, 'app', 'src', 'scope'), { recursive: true });

  const checkout = await findCheckout(join(ctx.dir, 'app', 'src', 'scope'), {});

  expect(checkout).toStrictEqual({
    worktree: join(ctx.dir, 'app'),
    commonDir: join(ctx.dir, 'app', '.git'),
  });
});

test('it finds the nearest checkout when one repository sits inside another', async () => {
  const ctx = await setupTest();

  runGit(ctx.dir, ['init', '--quiet', 'app']);
  runGit(ctx.dir, ['init', '--quiet', join('app', 'vendor', 'lib')]);

  const checkout = await findCheckout(join(ctx.dir, 'app', 'vendor', 'lib'), {});

  expect(checkout).toStrictEqual({
    worktree: join(ctx.dir, 'app', 'vendor', 'lib'),
    commonDir: join(ctx.dir, 'app', 'vendor', 'lib', '.git'),
  });
});

test('it finds a linked worktree and the git directory it shares with the main checkout', async () => {
  const ctx = await setupTest();

  runGit(ctx.dir, ['init', '--quiet', '--initial-branch=main', 'app']);
  runGit(join(ctx.dir, 'app'), ['commit', '--quiet', '--allow-empty', '--message', 'init']);
  runGit(join(ctx.dir, 'app'), ['worktree', 'add', '--quiet', '-b', 'feat/a', '.worktrees/a']);

  const checkout = await findCheckout(join(ctx.dir, 'app', '.worktrees', 'a'), {});

  expect(checkout).toStrictEqual({
    worktree: join(ctx.dir, 'app', '.worktrees', 'a'),
    commonDir: join(ctx.dir, 'app', '.git'),
  });
});

test('it takes the git directory a relative .git link names as the shared one when it names no common directory', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'modules', 'lib'), { recursive: true });
  await mkdir(join(ctx.dir, 'lib'));
  await writeFile(join(ctx.dir, 'lib', '.git'), 'gitdir: ../modules/lib\n');

  const checkout = await findCheckout(join(ctx.dir, 'lib'), {});

  expect(checkout).toStrictEqual({
    worktree: join(ctx.dir, 'lib'),
    commonDir: join(ctx.dir, 'modules', 'lib'),
  });
});

test('it finds no checkout when the nearest .git file names no git directory', async () => {
  const ctx = await setupTest();

  runGit(ctx.dir, ['init', '--quiet', 'app']);

  await mkdir(join(ctx.dir, 'app', 'lib'));
  await writeFile(join(ctx.dir, 'app', 'lib', '.git'), 'not a link\n');

  expect(findCheckout(join(ctx.dir, 'app', 'lib'), {})).resolves.toBeNull();
});

test('it finds no checkout above the stop directory', async () => {
  const ctx = await setupTest();

  runGit(ctx.dir, ['init', '--quiet', 'app']);

  await mkdir(join(ctx.dir, 'app', 'notes', 'drafts'), { recursive: true });

  expect(
    findCheckout(join(ctx.dir, 'app', 'notes', 'drafts'), {}, join(ctx.dir, 'app', 'notes')),
  ).resolves.toBeNull();
});

test('it finds a checkout in the stop directory itself', async () => {
  const ctx = await setupTest();

  runGit(ctx.dir, ['init', '--quiet', 'app']);

  await mkdir(join(ctx.dir, 'app', 'src'));

  const checkout = await findCheckout(join(ctx.dir, 'app', 'src'), {}, join(ctx.dir, 'app'));

  expect(checkout).toStrictEqual({
    worktree: join(ctx.dir, 'app'),
    commonDir: join(ctx.dir, 'app', '.git'),
  });
});

test.each([['GIT_DIR'], ['GIT_WORK_TREE'], ['GIT_COMMON_DIR']])(
  'it finds no checkout when %s overrides where git looks',
  async (name) => {
    const ctx = await setupTest();

    runGit(ctx.dir, ['init', '--quiet', 'app']);

    expect(findCheckout(join(ctx.dir, 'app'), { [name]: '/elsewhere/.git' })).resolves.toBeNull();
  },
);
