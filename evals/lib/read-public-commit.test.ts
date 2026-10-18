import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGit } from '../../test-utils/run-git.ts';
import { readPublicCommit } from './read-public-commit.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'public-commit-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  runGit(directory, ['init', '-q', '-b', 'main']);

  await mkdir(join(directory, 'src'));
  await writeFile(join(directory, 'src/index.ts'), 'export {};\n');

  runGit(directory, ['add', '.']);
  runGit(directory, ['commit', '-q', '-m', 'init']);

  return { directory, head: runGit(directory, ['rev-parse', 'HEAD']).trim() };
}

test('it reads the commit of a clean tree', async () => {
  const ctx = await setupTest();

  expect(readPublicCommit(ctx.directory, true)).toStrictEqual({ commit: ctx.head, dirty: false });
});

test('it refuses a live run on a tree with uncommitted source', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'src/index.ts'), 'export const changed = 1;\n');

  expect(() => readPublicCommit(ctx.directory, true)).toThrowWithMessage(
    Error,
    /^Commit the corpus, the experiments and the source before a live run\.$/u,
  );
});

test('it reads the commit of a dirty tree for an offline run and flags the tree dirty', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'src/index.ts'), 'export const changed = 1;\n');

  expect(readPublicCommit(ctx.directory, false)).toStrictEqual({ commit: ctx.head, dirty: true });
});

test('it ignores a change outside the guarded paths', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'notes.md'), 'scratch\n');

  expect(readPublicCommit(ctx.directory, true)).toStrictEqual({ commit: ctx.head, dirty: false });
});
