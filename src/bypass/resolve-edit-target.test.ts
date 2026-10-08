import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveEditTarget } from './resolve-edit-target.ts';

async function setupTest() {
  const created = await mkdtemp(join(tmpdir(), 'auto-mode-edit-target-'));
  const root = await realpath(created);

  onTestFinished(async () => {
    await rm(root, { recursive: true, force: true });
  });

  await mkdir(join(root, 'repo', 'src'), { recursive: true });
  await mkdir(join(root, 'outside'));
  await symlink(join(root, 'outside'), join(root, 'repo', 'link'));
  await symlink(join(root, 'outside', 'missing.ts'), join(root, 'repo', 'dangling.ts'));

  return { root };
}

test('it resolves a target through a link to where the write lands', async () => {
  const ctx = await setupTest();
  const target = await resolveEditTarget(join(ctx.root, 'repo', 'link', 'a.ts'));

  expect(target).toBe(join(ctx.root, 'outside', 'a.ts'));
});

test('it keeps the parts of a target that do not exist yet', async () => {
  const ctx = await setupTest();
  const target = await resolveEditTarget(join(ctx.root, 'repo', 'src', 'new', 'b.ts'));

  expect(target).toBe(join(ctx.root, 'repo', 'src', 'new', 'b.ts'));
});

test('it resolves a dangling link to nothing, since its target cannot be compared', async () => {
  const ctx = await setupTest();
  const target = await resolveEditTarget(join(ctx.root, 'repo', 'dangling.ts'));

  expect(target).toBeNull();
});
