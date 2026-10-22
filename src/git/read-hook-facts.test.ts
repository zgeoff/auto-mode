import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nodeHookFactsFiles } from './node-hook-facts-files.ts';
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
    {
      env: { GIT_CONFIG_SYSTEM: join(ctx.directory, 'gitconfig') },
      home: join(ctx.directory, 'home'),
    },
    nodeHookFactsFiles,
    [],
  );

  expect(facts).toStrictEqual({
    worktree: join(ctx.directory, 'repo'),
    hooksDirectory: join(ctx.directory, 'repo', '.git', 'hooks'),
    defaultHooksDirectory: join(ctx.directory, 'repo', '.git', 'hooks'),
    lefthookConfig: null,
    layerHooks: { system: null, global: null, repository: null },
    configFileHooks: {},
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
    {
      env: { GIT_CONFIG_SYSTEM: join(ctx.directory, 'gitconfig') },
      home: join(ctx.directory, 'home'),
    },
    nodeHookFactsFiles,
    [],
  );

  expect(facts).toStrictEqual({
    worktree: join(ctx.directory, 'repo', '.worktrees', 'feat'),
    hooksDirectory: join(ctx.directory, 'repo', '.worktrees', 'feat', 'githooks'),
    defaultHooksDirectory: join(ctx.directory, 'repo', '.git', 'hooks'),
    lefthookConfig: join(ctx.directory, 'repo', '.worktrees', 'feat', '.lefthook.yml'),
    layerHooks: {
      system: null,
      global: null,
      repository: join(ctx.directory, 'repo', '.worktrees', 'feat', 'githooks'),
    },
    configFileHooks: {},
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
    nodeHookFactsFiles,
    [],
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
    {
      env: { GIT_CONFIG_SYSTEM: join(ctx.directory, 'gitconfig') },
      home: join(ctx.directory, 'home'),
    },
    nodeHookFactsFiles,
    [],
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
    {
      env: { GIT_CONFIG_SYSTEM: join(ctx.directory, 'gitconfig') },
      home: join(ctx.directory, 'home'),
    },
    nodeHookFactsFiles,
    [],
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
    {
      env: { GIT_CONFIG_SYSTEM: join(ctx.directory, 'gitconfig') },
      home: join(ctx.directory, 'home'),
    },
    nodeHookFactsFiles,
    [],
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
    {
      env: { GIT_CONFIG_SYSTEM: join(ctx.directory, 'gitconfig') },
      home: join(ctx.directory, 'home'),
    },
    nodeHookFactsFiles,
    [],
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
    {
      env: { GIT_CONFIG_SYSTEM: join(ctx.directory, 'gitconfig') },
      home: join(ctx.directory, 'home'),
    },
    nodeHookFactsFiles,
    [],
  );

  expect(facts).toBeNull();
});

test('it rejects when a git config file cannot be read', () => {
  expect(
    readHookFacts(
      { worktree: '/srv/harbor', gitDir: '/srv/harbor/.git', commonDir: '/srv/harbor/.git' },
      { env: {}, home: '/home/robin' },
      {
        readText: () => Promise.reject(new Error('EACCES: permission denied')),
        probeFile: () => Promise.resolve(false),
      },
      [],
    ),
  ).rejects.toThrowWithMessage(Error, /EACCES/u);
});

test('it rejects when a lefthook config cannot be probed', () => {
  expect(
    readHookFacts(
      { worktree: '/srv/harbor', gitDir: '/srv/harbor/.git', commonDir: '/srv/harbor/.git' },
      { env: {}, home: '/home/robin' },
      {
        readText: () => Promise.resolve(null),
        probeFile: () => Promise.reject(new Error('EACCES: permission denied')),
      },
      [],
    ),
  ).rejects.toThrowWithMessage(Error, /EACCES/u);
});

test('it reads the hooks folder through the files its caller passes', async () => {
  const configs: Readonly<Record<string, string>> = {
    '/srv/harbor/.git/config': '[include]\n\tpath = hooks.config\n',
    '/srv/harbor/.git/hooks.config': '[core]\n\thooksPath = .checks\n',
  };

  const facts = await readHookFacts(
    { worktree: '/srv/harbor', gitDir: '/srv/harbor/.git', commonDir: '/srv/harbor/.git' },
    { env: {}, home: '/home/robin' },
    {
      readText: (path) => Promise.resolve(configs[path] ?? null),
      probeFile: (path) => Promise.resolve(path === '/srv/harbor/lefthook.toml'),
    },
    [],
  );

  expect(facts).toStrictEqual({
    worktree: '/srv/harbor',
    hooksDirectory: '/srv/harbor/.checks',
    defaultHooksDirectory: '/srv/harbor/.git/hooks',
    lefthookConfig: '/srv/harbor/lefthook.toml',
    layerHooks: { system: null, global: null, repository: '/srv/harbor/.checks' },
    configFileHooks: {},
  });
});

test('it reads the system core.hooksPath from /etc/gitconfig under the user and repository ones', async () => {
  const configs: Readonly<Record<string, string>> = {
    '/etc/gitconfig': '[core]\n\thooksPath = /srv/shared-hooks\n',
  };

  const facts = await readHookFacts(
    { worktree: '/srv/harbor', gitDir: '/srv/harbor/.git', commonDir: '/srv/harbor/.git' },
    { env: {}, home: '/home/robin' },
    {
      readText: (path) => Promise.resolve(configs[path] ?? null),
      probeFile: () => Promise.resolve(false),
    },
    [],
  );

  expect(facts).toStrictEqual({
    worktree: '/srv/harbor',
    hooksDirectory: '/srv/shared-hooks',
    defaultHooksDirectory: '/srv/harbor/.git/hooks',
    lefthookConfig: null,
    layerHooks: { system: '/srv/shared-hooks', global: null, repository: null },
    configFileHooks: {},
  });
});

test('it reads the user core.hooksPath over the system one', async () => {
  const configs: Readonly<Record<string, string>> = {
    '/etc/gitconfig': '[core]\n\thooksPath = /srv/shared-hooks\n',
    '/home/robin/.gitconfig': '[core]\n\thooksPath = /srv/user-hooks\n',
  };

  const facts = await readHookFacts(
    { worktree: '/srv/harbor', gitDir: '/srv/harbor/.git', commonDir: '/srv/harbor/.git' },
    { env: {}, home: '/home/robin' },
    {
      readText: (path) => Promise.resolve(configs[path] ?? null),
      probeFile: () => Promise.resolve(false),
    },
    [],
  );

  expect(facts?.hooksDirectory).toBe('/srv/user-hooks');
});

test("it reads the system config from the session's GIT_CONFIG_SYSTEM in place of /etc/gitconfig", async () => {
  const configs: Readonly<Record<string, string>> = {
    '/etc/gitconfig': '[core]\n\thooksPath = /srv/shared-hooks\n',
    '/srv/harbor/system.gitconfig': '[core]\n\thooksPath = /srv/session-hooks\n',
  };

  const facts = await readHookFacts(
    { worktree: '/srv/harbor', gitDir: '/srv/harbor/.git', commonDir: '/srv/harbor/.git' },
    { env: { GIT_CONFIG_SYSTEM: 'system.gitconfig' }, home: '/home/robin' },
    {
      readText: (path) => Promise.resolve(configs[path] ?? null),
      probeFile: () => Promise.resolve(false),
    },
    [],
  );

  expect(facts?.layerHooks.system).toBe('/srv/session-hooks');
});

test.each(['1', 'true'])(
  "it reads no system config when the session's GIT_CONFIG_NOSYSTEM is %s",
  async (value) => {
    const configs: Readonly<Record<string, string>> = {
      '/etc/gitconfig': '[core]\n\thooksPath = /srv/shared-hooks\n',
      '/srv/harbor/system.gitconfig': '[core]\n\thooksPath = /srv/session-hooks\n',
    };

    const facts = await readHookFacts(
      { worktree: '/srv/harbor', gitDir: '/srv/harbor/.git', commonDir: '/srv/harbor/.git' },
      {
        env: { GIT_CONFIG_NOSYSTEM: value, GIT_CONFIG_SYSTEM: 'system.gitconfig' },
        home: '/home/robin',
      },
      {
        readText: (path) => Promise.resolve(configs[path] ?? null),
        probeFile: () => Promise.resolve(false),
      },
      [],
    );

    expect(facts?.hooksDirectory).toBe('/srv/harbor/.git/hooks');
  },
);

test('it reads no hook facts from a system config with an includeIf', async () => {
  const configs: Readonly<Record<string, string>> = {
    '/etc/gitconfig': '[includeIf "gitdir:/srv/"]\n\tpath = /etc/gitconfig.srv\n',
  };

  const facts = await readHookFacts(
    { worktree: '/srv/harbor', gitDir: '/srv/harbor/.git', commonDir: '/srv/harbor/.git' },
    { env: {}, home: '/home/robin' },
    {
      readText: (path) => Promise.resolve(configs[path] ?? null),
      probeFile: () => Promise.resolve(false),
    },
    [],
  );

  expect(facts).toBeNull();
});

test('it reads the hooks folder each git config file the caller names sets', async () => {
  const configs: Readonly<Record<string, string>> = {
    '/home/robin/.gitconfig': '[core]\n\thooksPath = /srv/user-hooks\n',
    '/srv/harbor/quick.gitconfig': '[core]\n\thooksPath = checks\n',
    '/srv/harbor/plain.gitconfig': '[user]\n\tname = robin\n',
    '/srv/harbor/work.gitconfig': '[includeIf "gitdir:/srv/"]\n\tpath = hooks.config\n',
  };

  const facts = await readHookFacts(
    { worktree: '/srv/harbor', gitDir: '/srv/harbor/.git', commonDir: '/srv/harbor/.git' },
    { env: {}, home: '/home/robin' },
    {
      readText: (path) => Promise.resolve(configs[path] ?? null),
      probeFile: () => Promise.resolve(false),
    },
    [
      'quick.gitconfig',
      '/srv/harbor/plain.gitconfig',
      '',
      '/srv/missing.gitconfig',
      'work.gitconfig',
    ],
  );

  expect(facts).toStrictEqual({
    worktree: '/srv/harbor',
    hooksDirectory: '/srv/user-hooks',
    defaultHooksDirectory: '/srv/harbor/.git/hooks',
    lefthookConfig: null,
    layerHooks: { system: null, global: '/srv/user-hooks', repository: null },
    configFileHooks: {
      '/srv/harbor/quick.gitconfig': '/srv/harbor/checks',
      '/srv/harbor/plain.gitconfig': null,
      '': null,
      '/srv/missing.gitconfig': null,
    },
  });
});

test('it leaves out a named git config file that cannot be read, and keeps the other facts', async () => {
  const facts = await readHookFacts(
    { worktree: '/srv/harbor', gitDir: '/srv/harbor/.git', commonDir: '/srv/harbor/.git' },
    { env: {}, home: '/home/robin' },
    {
      readText: (path) =>
        path === '/srv/locked.gitconfig'
          ? Promise.reject(new Error('EACCES: permission denied'))
          : Promise.resolve(null),
      probeFile: () => Promise.resolve(false),
    },
    ['/srv/locked.gitconfig'],
  );

  expect(facts).toStrictEqual({
    worktree: '/srv/harbor',
    hooksDirectory: '/srv/harbor/.git/hooks',
    defaultHooksDirectory: '/srv/harbor/.git/hooks',
    lefthookConfig: null,
    layerHooks: { system: null, global: null, repository: null },
    configFileHooks: {},
  });
});

test("it reads the user config from the session's GIT_CONFIG_GLOBAL in place of the home configs", async () => {
  const configs: Readonly<Record<string, string>> = {
    '/home/robin/.gitconfig': '[core]\n\thooksPath = /srv/user-hooks\n',
    '/srv/harbor/session.gitconfig': '[core]\n\thooksPath = /srv/session-hooks\n',
  };

  const facts = await readHookFacts(
    { worktree: '/srv/harbor', gitDir: '/srv/harbor/.git', commonDir: '/srv/harbor/.git' },
    { env: { GIT_CONFIG_GLOBAL: 'session.gitconfig' }, home: '/home/robin' },
    {
      readText: (path) => Promise.resolve(configs[path] ?? null),
      probeFile: () => Promise.resolve(false),
    },
    [],
  );

  expect(facts?.hooksDirectory).toBe('/srv/session-hooks');
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
    {
      env: { GIT_CONFIG_SYSTEM: join(ctx.directory, 'gitconfig') },
      home: join(ctx.directory, 'home'),
    },
    nodeHookFactsFiles,
    [],
  );

  expect(facts).toBeNull();
});
