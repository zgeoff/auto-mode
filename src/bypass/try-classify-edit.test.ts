import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMockActionRequest } from '../../test-utils/factories/build-mock-action-request.ts';
import { buildMockOwnedScope } from '../../test-utils/factories/build-mock-owned-scope.ts';
import { runGit } from '../../test-utils/run-git.ts';
import { tryClassifyEdit } from './try-classify-edit.ts';

async function setupTest() {
  const created = await mkdtemp(join(tmpdir(), 'auto-mode-try-classify-edit-'));

  onTestFinished(() => rm(created, { recursive: true, force: true }));

  const dir = await realpath(created);

  const repo = join(dir, 'repo');

  runGit(dir, ['init', '-q', '-b', 'main', repo]);

  return { dir, repo };
}

test('it lets a Write inside an in-scope checkout on disk skip Jev', async () => {
  const ctx = await setupTest();

  const classification = await tryClassifyEdit(
    buildMockActionRequest({
      cwd: ctx.repo,
      toolName: 'Write',
      toolInput: { file_path: 'src/a.ts', content: 'export const a = 1;\n' },
    }),
    buildMockOwnedScope({ worktrees: [ctx.repo] }),
    { env: {}, home: ctx.dir },
  );

  expect(classification).toStrictEqual({ kind: 'bypass', target: join(ctx.repo, 'src', 'a.ts') });
});

test('it reads an Edit target file on disk to place the edit text', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.repo, 'a.ts'), 'export const a = 2;\n');

  const classification = await tryClassifyEdit(
    buildMockActionRequest({
      cwd: ctx.repo,
      toolName: 'Edit',
      toolInput: { file_path: 'a.ts', old_string: 'a = 1', new_string: 'a = 3' },
    }),
    buildMockOwnedScope({ worktrees: [ctx.repo] }),
    { env: {}, home: ctx.dir },
  );

  expect(classification).toStrictEqual({ kind: 'jev', reason: 'the edit text is not in the file' });
});

test('it classifies nothing for an action that is not a file-tool edit', async () => {
  const classification = await tryClassifyEdit(
    buildMockActionRequest({ cwd: '/w/app', toolName: 'Bash', toolInput: { command: 'ls' } }),
    buildMockOwnedScope({ worktrees: ['/w/app'] }),
    { env: {}, home: '/home/dev' },
  );

  expect(classification).toBeNull();
});

test('it classifies nothing when a git override names another checkout', async () => {
  const classification = await tryClassifyEdit(
    buildMockActionRequest({
      cwd: '/w/app',
      toolName: 'Write',
      toolInput: { file_path: 'a.ts', content: 'a' },
    }),
    buildMockOwnedScope({ worktrees: ['/w/app'] }),
    { env: { GIT_DIR: '/w/other/.git' }, home: '/home/dev' },
    {
      resolveEditTarget: (path) => Promise.resolve(path),
      findCheckout: () => Promise.resolve({ worktree: '/w/app', commonDir: '/w/app/.git' }),
      readFile: () => Promise.resolve(''),
    },
  );

  expect(classification).toBeNull();
});

test('it places the target with the injected reader instead of the disk', async () => {
  const classification = await tryClassifyEdit(
    buildMockActionRequest({
      cwd: '/w/app',
      toolName: 'Edit',
      toolInput: { file_path: 'link.ts', old_string: 'a = 1', new_string: 'a = 2' },
    }),
    buildMockOwnedScope({ worktrees: ['/w/app'] }),
    { env: {}, home: '/home/dev' },
    {
      resolveEditTarget: (path) => Promise.resolve(path.replace('/w/app/link.ts', '/w/app/a.ts')),
      findCheckout: () => Promise.resolve({ worktree: '/w/app', commonDir: '/w/app/.git' }),
      readFile: () => Promise.resolve('export const a = 1;\n'),
    },
  );

  expect(classification).toStrictEqual({ kind: 'bypass', target: '/w/app/a.ts' });
});

test('it sends an Edit to Jev when the injected reader cannot read the file', async () => {
  const classification = await tryClassifyEdit(
    buildMockActionRequest({
      cwd: '/w/app',
      toolName: 'Edit',
      toolInput: { file_path: 'a.ts', old_string: 'a = 1', new_string: 'a = 2' },
    }),
    buildMockOwnedScope({ worktrees: ['/w/app'] }),
    { env: {}, home: '/home/dev' },
    {
      resolveEditTarget: (path) => Promise.resolve(path),
      findCheckout: () => Promise.resolve({ worktree: '/w/app', commonDir: '/w/app/.git' }),
      readFile: () => Promise.reject(new Error('ENOENT')),
    },
  );

  expect(classification).toStrictEqual({
    kind: 'jev',
    reason: 'the edit cannot be read in the context of its file',
  });
});

test('it classifies nothing when the injected reader fails to find the checkout', async () => {
  const classification = await tryClassifyEdit(
    buildMockActionRequest({
      cwd: '/w/app',
      toolName: 'Write',
      toolInput: { file_path: 'a.ts', content: 'a' },
    }),
    buildMockOwnedScope({ worktrees: ['/w/app'] }),
    { env: {}, home: '/home/dev' },
    {
      resolveEditTarget: (path) => Promise.resolve(path),
      findCheckout: () => Promise.reject(new Error('git failed')),
      readFile: () => Promise.resolve(''),
    },
  );

  expect(classification).toBeNull();
});
