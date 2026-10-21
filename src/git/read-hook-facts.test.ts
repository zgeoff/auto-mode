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

  expect(facts?.hooksDirectory).toBe(join(ctx.directory, 'home', 'hooks'));
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

  expect(facts?.hooksDirectory).toBe('/srv/repo-hooks');
});

test('it reads core.hooksPath from a file the repository config includes, from the including folder', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'repo', '.git', 'shared'), { recursive: true });

  await writeFile(
    join(ctx.directory, 'repo', '.git', 'config'),
    '[include]\n\tpath = shared/hooks.config\n',
  );

  await writeFile(
    join(ctx.directory, 'repo', '.git', 'shared', 'hooks.config'),
    '[core]\n\thooksPath = .checks\n',
  );

  const facts = await readHookFacts(
    {
      worktree: join(ctx.directory, 'repo'),
      gitDir: join(ctx.directory, 'repo', '.git'),
      commonDir: join(ctx.directory, 'repo', '.git'),
    },
    { env: {}, home: join(ctx.directory, 'home') },
  );

  expect(facts?.hooksDirectory).toBe(join(ctx.directory, 'repo', '.checks'));
});

test('it reads a core.hooksPath set after an include over the included one, and skips a missing include', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'repo', '.git'), { recursive: true });
  await mkdir(join(ctx.directory, 'home'), { recursive: true });

  await writeFile(
    join(ctx.directory, 'home', '.gitconfig'),
    [
      '[include]',
      '\tpath = ~/.gitconfig.hooks',
      '[core]',
      '\thooksPath = /srv/user-hooks',
      '[include]',
      '\tpath = ~/.gitconfig.missing',
      '',
    ].join('\n'),
  );

  await writeFile(
    join(ctx.directory, 'home', '.gitconfig.hooks'),
    '[core]\n\thooksPath = /srv/included-hooks\n',
  );

  const facts = await readHookFacts(
    {
      worktree: join(ctx.directory, 'repo'),
      gitDir: join(ctx.directory, 'repo', '.git'),
      commonDir: join(ctx.directory, 'repo', '.git'),
    },
    { env: {}, home: join(ctx.directory, 'home') },
  );

  expect(facts?.hooksDirectory).toBe('/srv/user-hooks');
});

test('it reads no hook facts from a config with an includeIf', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'repo', '.git'), { recursive: true });

  await writeFile(
    join(ctx.directory, 'repo', '.git', 'config'),
    '[includeIf "gitdir:~/work/"]\n\tpath = work.config\n',
  );

  const facts = await readHookFacts(
    {
      worktree: join(ctx.directory, 'repo'),
      gitDir: join(ctx.directory, 'repo', '.git'),
      commonDir: join(ctx.directory, 'repo', '.git'),
    },
    { env: {}, home: join(ctx.directory, 'home') },
  );

  expect(facts).toBeNull();
});

test('it reads no hook facts from a config that includes itself', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'repo', '.git'), { recursive: true });
  await writeFile(join(ctx.directory, 'repo', '.git', 'config'), '[include]\n\tpath = config\n');

  const facts = await readHookFacts(
    {
      worktree: join(ctx.directory, 'repo'),
      gitDir: join(ctx.directory, 'repo', '.git'),
      commonDir: join(ctx.directory, 'repo', '.git'),
    },
    { env: {}, home: join(ctx.directory, 'home') },
  );

  expect(facts).toBeNull();
});

test('it reads no hook facts from a worktree with its own config', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'repo', '.git', 'worktrees', 'feat'), { recursive: true });

  await writeFile(
    join(ctx.directory, 'repo', '.git', 'worktrees', 'feat', 'config.worktree'),
    '[core]\n\thooksPath = /srv/feat-hooks\n',
  );

  const facts = await readHookFacts(
    {
      worktree: join(ctx.directory, 'repo', '.worktrees', 'feat'),
      gitDir: join(ctx.directory, 'repo', '.git', 'worktrees', 'feat'),
      commonDir: join(ctx.directory, 'repo', '.git'),
    },
    { env: {}, home: join(ctx.directory, 'home') },
  );

  expect(facts).toBeNull();
});
