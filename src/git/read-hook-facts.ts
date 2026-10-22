import { join, resolve } from 'node:path';
import type { HostEnvironment } from '../config/types.ts';
import { parseConfigEntries } from './parse-config-entries.ts';
import { resolveGlobalConfigPath } from './resolve-global-config-path.ts';
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

export async function readHookFacts(
  checkout: Checkout,
  host: Pick<HostEnvironment, 'env' | 'home'>,
  files: HookFactsFiles,
  globalConfigs: readonly string[],
): Promise<HookFacts | null> {
  const xdgConfig = host.env['XDG_CONFIG_HOME'] ?? join(host.home, '.config');
  const sessionGlobalConfig = host.env['GIT_CONFIG_GLOBAL'];

  // GIT_CONFIG_GLOBAL takes the place of both user config files.
  const userPaths =
    sessionGlobalConfig === undefined
      ? [join(xdgConfig, 'git', 'config'), join(host.home, '.gitconfig')]
      : [resolveGlobalConfigPath(sessionGlobalConfig, checkout.worktree)];

  const [repository, users] = await Promise.all([
    readConfigHooksPath(join(checkout.commonDir, 'config'), host.home, 0, files),
    Promise.all(userPaths.map((path) => readConfigHooksPath(path, host.home, 0, files))),
  ]);

  // A worktree's own config can set core.hooksPath, and git reads it only
  // under an extension this reader does not check.
  const hasWorktreeConfig = await files.probeFile(join(checkout.gitDir, 'config.worktree'));

  if (hasWorktreeConfig || [repository, ...users].some((config) => !config.isKnown)) {
    return null;
  }

  // A replacement git cannot read fails only the commands that name it.
  const replacements = await Promise.all(
    [...new Set(globalConfigs.map((path) => resolveGlobalConfigPath(path, checkout.worktree)))].map(
      async (path) => ({
        path,
        config: await readConfigHooksPath(path, host.home, 0, files).catch(() => UNKNOWN_CONFIG),
      }),
    ),
  );

  const candidates = LEFTHOOK_EXTENSIONS.flatMap((extension) =>
    LEFTHOOK_NAMES.map((name) => join(checkout.worktree, `${name}.${extension}`)),
  );

  const present = await Promise.all(candidates.map((path) => files.probeFile(path)));

  // git reads the user's config files before the repository's, and the last
  // core.hooksPath it reads wins.
  return {
    worktree: checkout.worktree,
    hooksDirectory: buildHooksDirectory([...users, repository], checkout, host.home),
    lefthookConfig: candidates.find((_, index) => present[index] === true) ?? null,
    globalConfigHooks: Object.fromEntries(
      replacements.flatMap((replacement) =>
        replacement.config.isKnown
          ? [
              [
                replacement.path,
                buildHooksDirectory([replacement.config, repository], checkout, host.home),
              ],
            ]
          : [],
      ),
    ),
  };
}

// git ignores an included file that is missing.
async function readConfigHooksPath(
  path: string,
  home: string,
  depth: number,
  files: HookFactsFiles,
): Promise<ConfigHooksPath> {
  if (path === '') {
    return { isKnown: true, hooksPath: null };
  }

  const config = await files.readText(path);

  let hooksPath: string | null = null;

  for (const entry of parseConfigEntries(config ?? '', { path, home, depth })) {
    if (entry.kind === 'unknown') {
      return UNKNOWN_CONFIG;
    }

    const value =
      entry.kind === 'hooks-path'
        ? { isKnown: true, hooksPath: entry.value }
        : await readConfigHooksPath(entry.path, home, depth + 1, files);

    if (!value.isKnown) {
      return value;
    }

    hooksPath = value.hooksPath ?? hooksPath;
  }

  return { isKnown: true, hooksPath };
}

function buildHooksDirectory(
  configs: readonly ConfigHooksPath[],
  checkout: Checkout,
  home: string,
): string {
  const hooksPath =
    configs.map((config) => config.hooksPath).findLast((path) => path !== null) ?? null;

  return hooksPath === null
    ? join(checkout.commonDir, 'hooks')
    : resolveHooksPath(hooksPath, checkout.worktree, home);
}

// git expands a leading `~/` in a path value, and reads a relative one from
// the worktree root, where it runs the hooks.
function resolveHooksPath(path: string, worktree: string, home: string): string {
  return path.startsWith('~/') ? join(home, path.slice(2)) : resolve(worktree, path);
}
