import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runGit } from '../../test-utils/run-git.ts';
import { requireResultsClone } from './require-results-clone.ts';

async function setupTest() {
  const tempDir = await mkdtemp(join(tmpdir(), 'results-clone-'));

  onTestFinished(() => rm(tempDir, { recursive: true, force: true }));

  const directory = await realpath(tempDir);

  runGit(directory, ['init', '-q', '-b', 'main']);

  return { directory, publicRoot: resolve(import.meta.dirname, '../..') };
}

test.each([
  ['an HTTPS', 'https://github.com/zgeoff/auto-mode-evals.git'],
  ['an HTTPS remote without .git', 'https://github.com/zgeoff/auto-mode-evals'],
  ['an HTTPS remote with a user', 'https://zgeoff@github.com/zgeoff/auto-mode-evals.git'],
  ['an SSH', 'git@github.com:zgeoff/auto-mode-evals.git'],
  ['an SSH URL', 'ssh://git@github.com/zgeoff/auto-mode-evals.git'],
])(
  'it accepts a clone whose origin is %s remote of the results repository',
  async (_label, url) => {
    const ctx = await setupTest();

    runGit(ctx.directory, ['remote', 'add', 'origin', url]);

    const clone = await requireResultsClone(ctx.directory, ctx.publicRoot);

    expect(clone).toStrictEqual({
      directory: ctx.directory,
      root: ctx.directory,
    });
  },
);

test('it accepts a clone without that origin that holds the results README and manifest', async () => {
  const ctx = await setupTest();

  runGit(ctx.directory, ['remote', 'add', 'origin', '/srv/mirrors/evals']);

  await writeFile(join(ctx.directory, 'README.md'), '# auto-mode-evals\n\nResults.\n');
  await writeFile(join(ctx.directory, 'MANIFEST.sha256'), '');

  const clone = await requireResultsClone(ctx.directory, ctx.publicRoot);

  expect(clone).toStrictEqual({
    directory: ctx.directory,
    root: ctx.directory,
  });
});

test('it resolves a directory inside the clone to its real path and the clone root', async () => {
  const ctx = await setupTest();

  runGit(ctx.directory, [
    'remote',
    'add',
    'origin',
    'https://github.com/zgeoff/auto-mode-evals.git',
  ]);

  await mkdir(join(ctx.directory, 'runs/consent/run-1'), { recursive: true });
  await symlink(join(ctx.directory, 'runs/consent/run-1'), join(ctx.directory, 'latest'));

  const clone = await requireResultsClone(join(ctx.directory, 'latest'), ctx.publicRoot);

  expect(clone).toStrictEqual({
    directory: join(ctx.directory, 'runs/consent/run-1'),
    root: ctx.directory,
  });
});

test('it refuses a clone of another repository', async () => {
  const ctx = await setupTest();

  runGit(ctx.directory, [
    'remote',
    'add',
    'origin',
    'https://github.com/zgeoff/auto-mode-evals-fork.git',
  ]);

  expect(requireResultsClone(ctx.directory, ctx.publicRoot)).rejects.toThrowWithMessage(
    Error,
    `The results directory is not a clone of zgeoff/auto-mode-evals: ${ctx.directory}`,
  );
});

test('it refuses a directory outside any git clone', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'results-plain-'));

  onTestFinished(() => rm(tempDir, { recursive: true, force: true }));

  const directory = await realpath(tempDir);

  expect(
    requireResultsClone(directory, resolve(import.meta.dirname, '../..')),
  ).rejects.toThrowWithMessage(Error, `The results directory is not in a git clone: ${directory}`);
});

test('it refuses a directory that does not exist', async () => {
  const ctx = await setupTest();

  expect(
    requireResultsClone(join(ctx.directory, 'missing'), ctx.publicRoot),
  ).rejects.toThrowWithMessage(
    Error,
    `The results directory does not exist: ${join(ctx.directory, 'missing')}`,
  );
});

test('it refuses a directory inside the public repository whose name starts with two dots', async () => {
  const ctx = await setupTest();

  runGit(ctx.directory, [
    'remote',
    'add',
    'origin',
    'https://github.com/zgeoff/auto-mode-evals.git',
  ]);

  await mkdir(join(ctx.directory, '..results'));

  expect(
    requireResultsClone(join(ctx.directory, '..results'), ctx.directory),
  ).rejects.toThrowWithMessage(
    Error,
    `Refusing to write results inside the public repository: ${join(ctx.directory, '..results')}`,
  );
});

test.each([
  ['SSH', 'git@gitlab.com:x/zgeoff/auto-mode-evals.git'],
  ['HTTPS', 'https://gitlab.com/github.com/zgeoff/auto-mode-evals.git'],
])(
  'it refuses a clone whose %s origin nests the results path under another host',
  async (_label, url) => {
    const ctx = await setupTest();

    runGit(ctx.directory, ['remote', 'add', 'origin', url]);

    expect(requireResultsClone(ctx.directory, ctx.publicRoot)).rejects.toThrowWithMessage(
      Error,
      `The results directory is not a clone of zgeoff/auto-mode-evals: ${ctx.directory}`,
    );
  },
);

test('it refuses a link into the public repository by its real path', async () => {
  const ctx = await setupTest();

  await symlink(join(ctx.publicRoot, 'evals'), join(ctx.directory, 'into-public'));

  expect(
    requireResultsClone(join(ctx.directory, 'into-public'), ctx.publicRoot),
  ).rejects.toThrowWithMessage(
    Error,
    `Refusing to write results inside the public repository: ${await realpath(join(ctx.publicRoot, 'evals'))}`,
  );
});
