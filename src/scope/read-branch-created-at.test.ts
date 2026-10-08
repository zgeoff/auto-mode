import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { runGit } from '../../test-utils/run-git.ts';
import { readBranchCreatedAt } from './read-branch-created-at.ts';

async function setupTest() {
  const created = await mkdtemp(join(tmpdir(), 'auto-mode-branch-created-'));

  onTestFinished(() => rm(created, { recursive: true, force: true }));

  const dir = await realpath(created);

  return { dir, commonDir: join(dir, '.git') };
}

test('it reads when git created a branch from its reflog', async () => {
  const ctx = await setupTest();

  runGit(ctx.dir, ['init', '--quiet', '--initial-branch=main']);
  runGit(ctx.dir, ['commit', '--quiet', '--allow-empty', '--message', 'init']);

  const before = Math.floor(Date.now() / 1000) * 1000;

  runGit(ctx.dir, ['branch', 'feat/a']);

  const createdAt = await readBranchCreatedAt(ctx.commonDir, 'feat/a');

  expect(createdAt).toBeWithin(before, Date.now() + 1);
});

test('it reads the time of the first reflog line, which records the creation', async () => {
  const ctx = await setupTest();

  const log = join(ctx.commonDir, 'logs', 'refs', 'heads', 'feat', 'a');

  await mkdir(dirname(log), { recursive: true });

  await writeFile(
    log,
    [
      '0000000000000000000000000000000000000000 1111111111111111111111111111111111111111 dev <dev@example.com> 1767225600 +0100\tbranch: Created from HEAD',
      '1111111111111111111111111111111111111111 2222222222222222222222222222222222222222 dev <dev@example.com> 1767229200 +0100\tcommit: next',
      '',
    ].join('\n'),
  );

  expect(readBranchCreatedAt(ctx.commonDir, 'feat/a')).resolves.toBe(1_767_225_600_000);
});

test('it reads nothing from a reflog that starts with an update of a branch that already existed', async () => {
  const ctx = await setupTest();

  const log = join(ctx.commonDir, 'logs', 'refs', 'heads', 'feat');

  await mkdir(dirname(log), { recursive: true });

  await writeFile(
    log,
    '1111111111111111111111111111111111111111 2222222222222222222222222222222222222222 dev <dev@example.com> 1767229200 -0500\tcommit: next\n',
  );

  expect(readBranchCreatedAt(ctx.commonDir, 'feat')).resolves.toBeNull();
});

test('it reads nothing for a branch with no reflog', async () => {
  const ctx = await setupTest();

  expect(readBranchCreatedAt(ctx.commonDir, 'feat/a')).resolves.toBeNull();
});

test('it reads nothing from a reflog line that is not in git format', async () => {
  const ctx = await setupTest();

  const log = join(ctx.commonDir, 'logs', 'refs', 'heads', 'feat');

  await mkdir(dirname(log), { recursive: true });
  await writeFile(log, '0000000000000000000000000000000000000000 created yesterday\n');

  expect(readBranchCreatedAt(ctx.commonDir, 'feat')).resolves.toBeNull();
});

test.each([['../../../../outside'], ['feat/../../../../../outside']])(
  'it reads nothing for the branch name %p, which leads out of the reflog directory',
  async (branch) => {
    const ctx = await setupTest();

    await writeFile(
      join(ctx.dir, 'outside'),
      '0000000000000000000000000000000000000000 1111111111111111111111111111111111111111 dev <dev@example.com> 1767225600 +0000\tbranch: Created from HEAD\n',
    );

    expect(readBranchCreatedAt(ctx.commonDir, branch)).resolves.toBeNull();
  },
);

test.each([['feat a'], ['feat;a'], ['feat~a']])(
  'it reads nothing for the branch name %p, which holds a character outside a plain ref name',
  async (branch) => {
    const ctx = await setupTest();

    const log = join(ctx.commonDir, 'logs', 'refs', 'heads', branch);

    await mkdir(dirname(log), { recursive: true });

    await writeFile(
      log,
      '0000000000000000000000000000000000000000 1111111111111111111111111111111111111111 dev <dev@example.com> 1767225600 +0000\tbranch: Created from HEAD\n',
    );

    expect(readBranchCreatedAt(ctx.commonDir, branch)).resolves.toBeNull();
  },
);
