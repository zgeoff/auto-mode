import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkCorpusSecrets } from './check-corpus-secrets.ts';

async function setupTest(): Promise<{ readonly dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'corpus-secrets-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it passes a dir with no secret and leaves it in place', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'cases.json'), '{"command":"git status"}\n');

  const clean = await checkCorpusSecrets(ctx.dir, { PATH: process.env['PATH'] });
  const entries = await readdir(ctx.dir);

  expect(clean).toBeTrue();
  expect(entries).toStrictEqual(['cases.json']);
});

test('it fails a dir that holds a planted fake token and removes the dir', async () => {
  const ctx = await setupTest();

  // Joined at run time so this file's own text matches no gitleaks rule.
  const fakeToken = ['npm', 'qz7mw2xk9vb4np6rt8lyzkqz7mw2xk9vb4np'].join('_');

  await writeFile(join(ctx.dir, 'cases.json'), `{"command":"echo ${fakeToken}"}\n`);

  const clean = await checkCorpusSecrets(ctx.dir, { PATH: process.env['PATH'] });
  const left = await stat(ctx.dir).catch(() => null);

  expect(clean).toBeFalse();
  expect(left).toBeNull();
});

test('it fails and removes the dir when gitleaks cannot run', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'cases.json'), '{"command":"git status"}\n');

  const clean = await checkCorpusSecrets(ctx.dir, { PATH: ctx.dir });
  const left = await stat(ctx.dir).catch(() => null);

  expect(clean).toBeFalse();
  expect(left).toBeNull();
});
