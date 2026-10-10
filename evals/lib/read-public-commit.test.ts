import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGit } from '../../test-utils/run-git.ts';
import { readPublicCommit } from './read-public-commit.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'public-commit-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));
  runGit(dir, ['init', '-q', '-b', 'main']);

  await mkdir(join(dir, 'src'));
  await writeFile(join(dir, 'src/index.ts'), 'export {};\n');

  runGit(dir, ['add', '.']);
  runGit(dir, ['commit', '-q', '-m', 'init']);

  return { dir, head: runGit(dir, ['rev-parse', 'HEAD']).trim() };
}

test('it reads the commit of a clean tree', async () => {
  const ctx = await setupTest();

  expect(readPublicCommit(ctx.dir, true)).toBe(ctx.head);
});

test('it refuses a live run on a tree with uncommitted source', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'src/index.ts'), 'export const changed = 1;\n');

  expect(() => readPublicCommit(ctx.dir, true)).toThrowWithMessage(
    Error,
    /^Commit the corpus, the experiments and the source before a live run\.$/,
  );
});

test('it reads the commit of a dirty tree for an offline run', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'src/index.ts'), 'export const changed = 1;\n');

  expect(readPublicCommit(ctx.dir, false)).toBe(ctx.head);
});

test('it ignores a change outside the guarded paths', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'notes.md'), 'scratch\n');

  expect(readPublicCommit(ctx.dir, true)).toBe(ctx.head);
});
