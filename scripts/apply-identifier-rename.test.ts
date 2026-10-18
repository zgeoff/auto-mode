import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGit } from '../test-utils/run-git.ts';
import { applyIdentifierRename } from './apply-identifier-rename.ts';

async function setupTest() {
  const root = await mkdtemp(join(tmpdir(), 'auto-mode-identifier-rename-'));

  onTestFinished(() => rm(root, { recursive: true, force: true }));
  runGit(root, ['init', '--quiet']);

  return { root };
}

test('it renames the bindings and property readers and keeps strings, comments and import.meta.dir', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.root, 'paths.ts'),
    [
      '// the dir comes from the caller',
      'export function buildPaths(dir: string) {',
      "  const label = 'dir';",
      '  const shape = { dir };',
      '',
      "  return [shape.dir, dir + '/dir', label, import.meta.dir];",
      '}',
      '',
    ].join('\n'),
  );

  runGit(ctx.root, ['add', 'paths.ts']);

  const outcome = await applyIdentifierRename({
    root: ctx.root,
    from: 'dir',
    to: 'directory',
    skipped: [],
  });

  const renamed = await readFile(join(ctx.root, 'paths.ts'), 'utf8');

  expect(outcome).toStrictEqual({ renamed: ['paths.ts'], collided: [] });

  expect(renamed).toBe(
    [
      '// the dir comes from the caller',
      'export function buildPaths(directory: string) {',
      "  const label = 'dir';",
      '  const shape = { directory };',
      '',
      "  return [shape.directory, directory + '/dir', label, import.meta.dir];",
      '}',
      '',
    ].join('\n'),
  );
});

test('it leaves a file that already names the new identifier unchanged', async () => {
  const ctx = await setupTest();

  const source = 'export const directory = 1;\nexport const dir = directory + 1;\n';

  await writeFile(join(ctx.root, 'counts.ts'), source);

  runGit(ctx.root, ['add', 'counts.ts']);

  const outcome = await applyIdentifierRename({
    root: ctx.root,
    from: 'dir',
    to: 'directory',
    skipped: [],
  });

  const kept = await readFile(join(ctx.root, 'counts.ts'), 'utf8');

  expect(outcome).toStrictEqual({ renamed: [], collided: ['counts.ts'] });
  expect(kept).toBe(source);
});

test('it leaves a skipped file unchanged', async () => {
  const ctx = await setupTest();

  const source = 'export const dir = 1;\n';

  await writeFile(join(ctx.root, 'synced.ts'), source);

  runGit(ctx.root, ['add', 'synced.ts']);

  const outcome = await applyIdentifierRename({
    root: ctx.root,
    from: 'dir',
    to: 'directory',
    skipped: ['synced.ts'],
  });

  const kept = await readFile(join(ctx.root, 'synced.ts'), 'utf8');

  expect(outcome).toStrictEqual({ renamed: [], collided: [] });
  expect(kept).toBe(source);
});

test('it leaves a file the git index does not track unchanged', async () => {
  const ctx = await setupTest();

  const source = 'export const dir = 1;\n';

  await writeFile(join(ctx.root, 'untracked.ts'), source);

  const outcome = await applyIdentifierRename({
    root: ctx.root,
    from: 'dir',
    to: 'directory',
    skipped: [],
  });

  const kept = await readFile(join(ctx.root, 'untracked.ts'), 'utf8');

  expect(outcome).toStrictEqual({ renamed: [], collided: [] });
  expect(kept).toBe(source);
});
