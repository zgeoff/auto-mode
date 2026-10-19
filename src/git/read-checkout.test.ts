import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGit } from '../../test-utils/run-git.ts';
import { readCheckout } from './read-checkout.ts';

async function setupTest() {
  const created = await mkdtemp(join(tmpdir(), 'auto-mode-read-checkout-'));

  onTestFinished(() => rm(created, { recursive: true, force: true }));

  const directory = await realpath(created);

  return { directory };
}

test('it finds the checkout whose .git directory sits in the start directory', async () => {
  const ctx = await setupTest();

  runGit(ctx.directory, ['init', '--quiet', 'app']);

  const checkout = await readCheckout(join(ctx.directory, 'app'), {});

  expect(checkout).toStrictEqual({
    worktree: join(ctx.directory, 'app'),
    gitDir: join(ctx.directory, 'app', '.git'),
    commonDir: join(ctx.directory, 'app', '.git'),
  });
});

test('it walks up from a subdirectory to the checkout that holds it', async () => {
  const ctx = await setupTest();

  runGit(ctx.directory, ['init', '--quiet', 'app']);

  await mkdir(join(ctx.directory, 'app', 'src', 'scope'), { recursive: true });

  const checkout = await readCheckout(join(ctx.directory, 'app', 'src', 'scope'), {});

  expect(checkout).toStrictEqual({
    worktree: join(ctx.directory, 'app'),
    gitDir: join(ctx.directory, 'app', '.git'),
    commonDir: join(ctx.directory, 'app', '.git'),
  });
});

test('it finds the nearest checkout when one repository sits inside another', async () => {
  const ctx = await setupTest();

  runGit(ctx.directory, ['init', '--quiet', 'app']);
  runGit(ctx.directory, ['init', '--quiet', join('app', 'vendor', 'lib')]);

  const checkout = await readCheckout(join(ctx.directory, 'app', 'vendor', 'lib'), {});

  expect(checkout).toStrictEqual({
    worktree: join(ctx.directory, 'app', 'vendor', 'lib'),
    gitDir: join(ctx.directory, 'app', 'vendor', 'lib', '.git'),
    commonDir: join(ctx.directory, 'app', 'vendor', 'lib', '.git'),
  });
});

test('it finds a linked worktree and the git directory it shares with the main checkout', async () => {
  const ctx = await setupTest();

  runGit(ctx.directory, ['init', '--quiet', '--initial-branch=main', 'app']);
  runGit(join(ctx.directory, 'app'), ['commit', '--quiet', '--allow-empty', '--message', 'init']);

  runGit(join(ctx.directory, 'app'), [
    'worktree',
    'add',
    '--quiet',
    '-b',
    'feat/a',
    '.worktrees/a',
  ]);

  const checkout = await readCheckout(join(ctx.directory, 'app', '.worktrees', 'a'), {});

  expect(checkout).toStrictEqual({
    worktree: join(ctx.directory, 'app', '.worktrees', 'a'),
    gitDir: join(ctx.directory, 'app', '.git', 'worktrees', 'a'),
    commonDir: join(ctx.directory, 'app', '.git'),
  });
});

test('it takes the git directory a relative .git link names as the shared one when it names no common directory', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'modules', 'lib'), { recursive: true });
  await mkdir(join(ctx.directory, 'lib'));
  await writeFile(join(ctx.directory, 'lib', '.git'), 'gitdir: ../modules/lib\n');

  const checkout = await readCheckout(join(ctx.directory, 'lib'), {});

  expect(checkout).toStrictEqual({
    worktree: join(ctx.directory, 'lib'),
    gitDir: join(ctx.directory, 'modules', 'lib'),
    commonDir: join(ctx.directory, 'modules', 'lib'),
  });
});

test('it finds no checkout when the nearest .git file names no git directory', async () => {
  const ctx = await setupTest();

  runGit(ctx.directory, ['init', '--quiet', 'app']);

  await mkdir(join(ctx.directory, 'app', 'lib'));
  await writeFile(join(ctx.directory, 'app', 'lib', '.git'), 'not a link\n');

  expect(readCheckout(join(ctx.directory, 'app', 'lib'), {})).resolves.toBeNull();
});

test('it finds no checkout when the walk reaches the root without a .git', () => {
  // A sandbox can place a .git above the system temp directory, so the walk
  // starts at the root, the one directory every host shares.
  expect(readCheckout('/', {})).resolves.toBeNull();
});

test('it finds no checkout above the stop directory', async () => {
  const ctx = await setupTest();

  runGit(ctx.directory, ['init', '--quiet', 'app']);

  await mkdir(join(ctx.directory, 'app', 'notes', 'drafts'), { recursive: true });

  expect(
    readCheckout(
      join(ctx.directory, 'app', 'notes', 'drafts'),
      {},
      join(ctx.directory, 'app', 'notes'),
    ),
  ).resolves.toBeNull();
});

test('it finds a checkout in the stop directory itself', async () => {
  const ctx = await setupTest();

  runGit(ctx.directory, ['init', '--quiet', 'app']);

  await mkdir(join(ctx.directory, 'app', 'src'));

  const checkout = await readCheckout(
    join(ctx.directory, 'app', 'src'),
    {},
    join(ctx.directory, 'app'),
  );

  expect(checkout).toStrictEqual({
    worktree: join(ctx.directory, 'app'),
    gitDir: join(ctx.directory, 'app', '.git'),
    commonDir: join(ctx.directory, 'app', '.git'),
  });
});

test.each([['GIT_DIR'], ['GIT_WORK_TREE'], ['GIT_COMMON_DIR']])(
  'it finds no checkout when %s overrides where git looks',
  async (name) => {
    const ctx = await setupTest();

    runGit(ctx.directory, ['init', '--quiet', 'app']);

    expect(
      readCheckout(join(ctx.directory, 'app'), { [name]: '/elsewhere/.git' }),
    ).resolves.toBeNull();
  },
);
