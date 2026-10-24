import { join, resolve } from 'node:path';
import type { HostEnvironment } from '../config/types.ts';
import { parseConfigEntries } from './parse-config-entries.ts';
import { parseGitBoolean } from './parse-git-boolean.ts';
import { resolveConfigFilePath } from './resolve-config-file-path.ts';
import type { Checkout, HookFacts, HookFactsFiles } from './types.ts';

// lefthook 2.2.1 tries each extension in turn, and each name within it, and
// loads the first file that exists at the worktree root.
const LEFTHOOK_EXTENSIONS = ['yml', 'yaml', 'json', 'jsonc', 'toml'];
const LEFTHOOK_NAMES = ['lefthook', '.lefthook', '.config/lefthook'];

interface ConfigHooksPath {
  readonly isKnown: boolean;
  readonly hooksPath: string | null;
}

const UNKNOWN_CONFIG: ConfigHooksPath = { isKnown: false, hooksPath: null };

// An include can name a file more than once, so a few small files can fan out
// to thousands of reads.
const MAX_CONFIG_READS = 64;
const MAX_CONFIG_TOTAL_BYTES = 4_194_304;

interface ConfigReader {
  readonly home: string;
  readonly files: HookFactsFiles;
  readonly budget: { reads: number; bytes: number };
  queue: Promise<void>;
}

export async function readHookFacts(
  checkout: Checkout,
  host: Pick<HostEnvironment, 'env' | 'home'>,
  files: HookFactsFiles,
  configFiles: readonly string[],
): Promise<HookFacts | null> {
  const reader: ConfigReader = {
    home: host.home,
    files,
    budget: { reads: MAX_CONFIG_READS, bytes: MAX_CONFIG_TOTAL_BYTES },
    queue: Promise.resolve(),
  };

  const xdgConfig = host.env['XDG_CONFIG_HOME'] ?? join(host.home, '.config');
  const sessionGlobalConfig = host.env['GIT_CONFIG_GLOBAL'];
  const sessionSystemConfig = host.env['GIT_CONFIG_SYSTEM'];

  // GIT_CONFIG_GLOBAL takes the place of both user config files.
  const globalPaths =
    sessionGlobalConfig === undefined
      ? [join(xdgConfig, 'git', 'config'), join(host.home, '.gitconfig')]
      : [resolveConfigFilePath(sessionGlobalConfig, checkout.worktree)];

  // Distribution builds of git read the system config from /etc/gitconfig.
  const systemPaths =
    parseGitBoolean(host.env['GIT_CONFIG_NOSYSTEM'] ?? '') === true
      ? []
      : [resolveConfigFilePath(sessionSystemConfig ?? '/etc/gitconfig', checkout.worktree)];

  const [repository, globals, systems] = await Promise.all([
    readConfigHooksPath(join(checkout.commonDir, 'config'), 0, reader),
    Promise.all(globalPaths.map((path) => readConfigHooksPath(path, 0, reader))),
    Promise.all(systemPaths.map((path) => readConfigHooksPath(path, 0, reader))),
  ]);

  // A worktree's own config can set core.hooksPath, and git reads it only
  // under the worktreeConfig extension.
  const hasWorktreeConfig = await files.probeFile(join(checkout.gitDir, 'config.worktree'));

  if (hasWorktreeConfig || [repository, ...globals, ...systems].some((config) => !config.isKnown)) {
    return null;
  }

  // A named file git cannot read fails only the commands that name it.
  const named = await Promise.all(
    [...new Set(configFiles.map((path) => resolveConfigFilePath(path, checkout.worktree)))].map(
      async (path) => ({
        path,
        config: await readConfigHooksPath(path, 0, reader).catch(() => UNKNOWN_CONFIG),
      }),
    ),
  );

  const candidates = LEFTHOOK_EXTENSIONS.flatMap((extension) =>
    LEFTHOOK_NAMES.map((name) => join(checkout.worktree, `${name}.${extension}`)),
  );

  const present = await Promise.all(candidates.map((path) => files.probeFile(path)));

  const layerHooks = {
    system: findHooksDirectory(systems, checkout.worktree, host.home),
    global: findHooksDirectory(globals, checkout.worktree, host.home),
    repository: findHooksDirectory([repository], checkout.worktree, host.home),
  };

  const defaultHooksDirectory = join(checkout.commonDir, 'hooks');

  // git reads the system config, then the user's, then the repository's, and
  // the last core.hooksPath it reads wins.
  return {
    worktree: checkout.worktree,
    hooksDirectory:
      layerHooks.repository ?? layerHooks.global ?? layerHooks.system ?? defaultHooksDirectory,
    defaultHooksDirectory,
    lefthookConfig: candidates.find((_, index) => present[index] === true) ?? null,
    layerHooks,
    configFileHooks: Object.fromEntries(
      named.flatMap((file) =>
        file.config.isKnown
          ? [[file.path, findHooksDirectory([file.config], checkout.worktree, host.home)]]
          : [],
      ),
    ),
  };
}

async function readConfigHooksPath(
  path: string,
  depth: number,
  reader: ConfigReader,
): Promise<ConfigHooksPath> {
  if (path === '') {
    return { isKnown: true, hooksPath: null };
  }

  if (reader.budget.reads === 0) {
    return UNKNOWN_CONFIG;
  }

  reader.budget.reads -= 1;

  const config = await readBudgetedText(path, reader);

  if (config === undefined) {
    return UNKNOWN_CONFIG;
  }

  let hooksPath: string | null = null;

  // git ignores an included file that is missing.
  for (const entry of parseConfigEntries(config ?? '', { path, home: reader.home, depth })) {
    if (entry.kind === 'unknown') {
      return UNKNOWN_CONFIG;
    }

    const value =
      entry.kind === 'hooks-path'
        ? { isKnown: true, hooksPath: entry.value }
        : await readConfigHooksPath(entry.path, depth + 1, reader);

    if (!value.isKnown) {
      return value;
    }

    hooksPath = value.hooksPath ?? hooksPath;
  }

  return { isKnown: true, hooksPath };
}

async function readBudgetedText(
  path: string,
  reader: ConfigReader,
): Promise<string | null | undefined> {
  const previous = reader.queue;
  const turn = Promise.withResolvers<void>();

  reader.queue = turn.promise;

  await previous;

  try {
    const text = await reader.files.readText(path, reader.budget.bytes);

    reader.budget.bytes -= Buffer.byteLength(text ?? '');

    return reader.budget.bytes < 0 ? undefined : text;
  } finally {
    turn.resolve();
  }
}

function findHooksDirectory(
  configs: readonly ConfigHooksPath[],
  worktree: string,
  home: string,
): string | null {
  const hooksPath =
    configs.map((config) => config.hooksPath).findLast((path) => path !== null) ?? null;

  return hooksPath === null ? null : resolveHooksPath(hooksPath, worktree, home);
}

// git expands a leading `~/` in a path value, and reads a relative one from
// the worktree root, where it runs the hooks.
function resolveHooksPath(path: string, worktree: string, home: string): string {
  return path.startsWith('~/') ? join(home, path.slice(2)) : resolve(worktree, path);
}
