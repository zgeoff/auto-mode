import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveEditTarget } from './resolve-edit-target.ts';

async function setupTest(): Promise<{ readonly root: string }> {
  const created = await mkdtemp(join(tmpdir(), 'auto-mode-edit-target-'));

  onTestFinished(() => rm(created, { recursive: true, force: true }));

  // The unit answers with real paths, and the temp directory can sit behind a link.
  return { root: await realpath(created) };
}

test('it resolves a target through a link to where the write lands', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'repo'));
  await mkdir(join(ctx.root, 'outside'));
  await symlink(join(ctx.root, 'outside'), join(ctx.root, 'repo', 'link'));

  const target = await resolveEditTarget(join(ctx.root, 'repo', 'link', 'a.ts'));

  expect(target).toBe(join(ctx.root, 'outside', 'a.ts'));
});

test('it keeps the parts of a target that do not exist yet', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'repo', 'src'), { recursive: true });

  const target = await resolveEditTarget(join(ctx.root, 'repo', 'src', 'new', 'b.ts'));

  expect(target).toBe(join(ctx.root, 'repo', 'src', 'new', 'b.ts'));
});

test('it resolves a dangling link to nothing, since its target cannot be compared', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'repo'));
  await symlink(join(ctx.root, 'outside', 'missing.ts'), join(ctx.root, 'repo', 'dangling.ts'));

  const target = await resolveEditTarget(join(ctx.root, 'repo', 'dangling.ts'));

  expect(target).toBeNull();
});
