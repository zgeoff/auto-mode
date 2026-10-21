import { access, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { HostEnvironment } from '../config/types.ts';
import { parseConfigValue } from './parse-config-value.ts';
import type { Checkout, HookFacts } from './types.ts';

// lefthook 2.2.1 tries each extension in turn, and each name within it, and
// loads the first file that exists at the worktree root.
const LEFTHOOK_EXTENSIONS = ['yml', 'yaml', 'json', 'jsonc', 'toml'];
const LEFTHOOK_NAMES = ['lefthook', '.lefthook', '.config/lefthook'];

export async function readHookFacts(
  checkout: Checkout,
  host: Pick<HostEnvironment, 'env' | 'home'>,
): Promise<HookFacts | null> {
  const xdgConfig = host.env['XDG_CONFIG_HOME'] ?? join(host.home, '.config');

  // git reads the user's config files before the repository's, and the last
  // core.hooksPath it reads wins.
  const configs = await Promise.all(
    [
      join(xdgConfig, 'git', 'config'),
      join(host.home, '.gitconfig'),
      join(checkout.commonDir, 'config'),
    ].map((path) => readConfigHooksPath(path, host.home, 0)),
  );

  // A worktree's own config can set core.hooksPath, and git reads it only
  // under an extension this reader does not check.
  const hasWorktreeConfig = await access(join(checkout.gitDir, 'config.worktree')).then(
    () => true,
    () => false,
  );

  if (hasWorktreeConfig || configs.some((config) => !config.isKnown)) {
    return null;
  }

  const hooksPath =
    configs.map((config) => config.hooksPath).findLast((path) => path !== null) ?? null;

  const candidates = LEFTHOOK_EXTENSIONS.flatMap((extension) =>
    LEFTHOOK_NAMES.map((name) => join(checkout.worktree, `${name}.${extension}`)),
  );

  const present = await Promise.all(
    candidates.map((path) =>
      access(path).then(
        () => true,
        () => false,
      ),
    ),
  );

  return {
    worktree: checkout.worktree,
    hooksDirectory:
      hooksPath === null
        ? join(checkout.commonDir, 'hooks')
        : resolveHooksPath(hooksPath, checkout.worktree, host.home),
    lefthookConfig: candidates.find((_, index) => present[index] === true) ?? null,
  };
}

interface ConfigHooksPath {
  readonly isKnown: boolean;
  readonly hooksPath: string | null;
}

// git stops past this many nested includes.
const MAX_INCLUDE_DEPTH = 10;

// git reads an included file in place, ignores one that is missing, and reads
// a relative include path from the including file's folder. An includeIf
// holds a condition this reader does not judge, so it leaves the value unknown.
async function readConfigHooksPath(
  path: string,
  home: string,
  depth: number,
): Promise<ConfigHooksPath> {
  const config = await readFile(path, 'utf8').catch(() => null);

  let section = '';
  let hooksPath: string | null = null;

  for (const line of config?.split('\n') ?? []) {
    const header = /^\s*\[(?<section>[^\]]*)\]/u.exec(line)?.groups?.['section'];
    const entry = /^\s*(?<key>[\w-]+)\s*=(?<value>.*)$/u.exec(line)?.groups;
    const key = entry?.['key']?.toLowerCase();
    const value = parseConfigValue(entry?.['value'] ?? '');

    if (header !== undefined) {
      section = header.trim().toLowerCase();

      if (section.startsWith('includeif')) {
        return { isKnown: false, hooksPath: null };
      }
    } else if (section === 'core' && key === 'hookspath') {
      hooksPath = value;
    } else if (section === 'include' && key === 'path') {
      if (depth >= MAX_INCLUDE_DEPTH) {
        return { isKnown: false, hooksPath: null };
      }

      const includePath = value.startsWith('~/')
        ? join(home, value.slice(2))
        : resolve(dirname(path), value);

      const included = await readConfigHooksPath(includePath, home, depth + 1);

      if (!included.isKnown) {
        return included;
      }

      hooksPath = included.hooksPath ?? hooksPath;
    }
  }

  return { isKnown: true, hooksPath };
}

// git expands a leading `~/` in a path value, and reads a relative one from
// the worktree root, where it runs the hooks.
function resolveHooksPath(path: string, worktree: string, home: string): string {
  return path.startsWith('~/') ? join(home, path.slice(2)) : resolve(worktree, path);
}
