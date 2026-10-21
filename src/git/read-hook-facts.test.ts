import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readHookFacts } from './read-hook-facts.ts';

async function setupTest(): Promise<{ readonly directory: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'hook-facts-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it reads the common hooks folder and no lefthook config from a checkout that sets neither', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'repo', '.git'), { recursive: true });

  const facts = await readHookFacts(
    {
      worktree: join(ctx.directory, 'repo'),
      gitDir: join(ctx.directory, 'repo', '.git'),
      commonDir: join(ctx.directory, 'repo', '.git'),
    },
    { env: {}, home: join(ctx.directory, 'home') },
  );

  expect(facts).toStrictEqual({
    worktree: join(ctx.directory, 'repo'),
    hooksDirectory: join(ctx.directory, 'repo', '.git', 'hooks'),
    lefthookConfig: null,
  });
});

test('it reads a relative core.hooksPath from the worktree root and the config lefthook loads first', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'repo', '.git', 'worktrees', 'feat'), { recursive: true });
  await mkdir(join(ctx.directory, 'repo', '.worktrees', 'feat'), { recursive: true });

  await writeFile(
    join(ctx.directory, 'repo', '.git', 'config'),
    [
      '[core]',
      '\tbare = false',
      '\tHooksPath = "githooks" ; shared',
      '[user]',
      '\thooksPath = no',
      '',
    ].join('\n'),
  );

  await writeFile(join(ctx.directory, 'repo', '.worktrees', 'feat', 'lefthook.yaml'), '');
  await writeFile(join(ctx.directory, 'repo', '.worktrees', 'feat', '.lefthook.yml'), '');

  const facts = await readHookFacts(
    {
      worktree: join(ctx.directory, 'repo', '.worktrees', 'feat'),
      gitDir: join(ctx.directory, 'repo', '.git', 'worktrees', 'feat'),
      commonDir: join(ctx.directory, 'repo', '.git'),
    },
    { env: {}, home: join(ctx.directory, 'home') },
  );

  expect(facts).toStrictEqual({
    worktree: join(ctx.directory, 'repo', '.worktrees', 'feat'),
    hooksDirectory: join(ctx.directory, 'repo', '.worktrees', 'feat', 'githooks'),
    lefthookConfig: join(ctx.directory, 'repo', '.worktrees', 'feat', '.lefthook.yml'),
  });
});

test('it reads the user core.hooksPath under home when the repository sets none', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'repo', '.git'), { recursive: true });
  await mkdir(join(ctx.directory, 'xdg', 'git'), { recursive: true });
  await mkdir(join(ctx.directory, 'home'), { recursive: true });

  await writeFile(
    join(ctx.directory, 'xdg', 'git', 'config'),
    '[core]\n\thooksPath = /srv/xdg-hooks\n',
  );

  await writeFile(join(ctx.directory, 'home', '.gitconfig'), '[core]\n\thooksPath = ~/hooks\n');

  const facts = await readHookFacts(
    {
      worktree: join(ctx.directory, 'repo'),
      gitDir: join(ctx.directory, 'repo', '.git'),
      commonDir: join(ctx.directory, 'repo', '.git'),
    },
    { env: { XDG_CONFIG_HOME: join(ctx.directory, 'xdg') }, home: join(ctx.directory, 'home') },
  );

  expect(facts.hooksDirectory).toBe(join(ctx.directory, 'home', 'hooks'));
});

test('it reads the repository core.hooksPath over the user one', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'repo', '.git'), { recursive: true });
  await mkdir(join(ctx.directory, 'home'), { recursive: true });
  await writeFile(join(ctx.directory, 'home', '.gitconfig'), '[core]\n\thooksPath = ~/hooks\n');

  await writeFile(
    join(ctx.directory, 'repo', '.git', 'config'),
    '[core]\n\thooksPath = /srv/repo-hooks\n',
  );

  const facts = await readHookFacts(
    {
      worktree: join(ctx.directory, 'repo'),
      gitDir: join(ctx.directory, 'repo', '.git'),
      commonDir: join(ctx.directory, 'repo', '.git'),
    },
    { env: {}, home: join(ctx.directory, 'home') },
  );

  expect(facts.hooksDirectory).toBe('/srv/repo-hooks');
});
