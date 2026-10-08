import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCheckoutRemotes } from './load-checkout-remotes.ts';

async function setupTest(config: string) {
  const dir = await mkdtemp(join(tmpdir(), 'checkout-remotes-'));

  onTestFinished(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  await writeFile(join(dir, 'config'), config);

  return { dir };
}

test('it reads remote URLs the way Git does, without quotes, escapes, or comments', async () => {
  const ctx = await setupTest(
    [
      '[core]',
      '\turl = https://not-a-remote.example.com',
      '[remote "origin"]',
      '\turl = git@github.com:dev/app.git ; the main remote',
      '\tpushurl = "https://git.example.com/dev/app.git"',
      '[remote "spaced"]',
      '\tURL = "https://git.example.com/dev/my\\"app.git" # quoted',
      '',
    ].join('\n'),
  );

  const remotes = await loadCheckoutRemotes(ctx.dir);

  expect(remotes).toStrictEqual([
    { name: 'origin', url: 'git@github.com:dev/app.git' },
    { name: 'origin', url: 'https://git.example.com/dev/app.git' },
    { name: 'spaced', url: 'https://git.example.com/dev/my"app.git' },
  ]);
});
