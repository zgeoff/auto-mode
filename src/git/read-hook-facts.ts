import { access, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
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
): Promise<HookFacts> {
  const xdgConfig = host.env['XDG_CONFIG_HOME'] ?? join(host.home, '.config');

  // git reads the user's config files before the repository's, and the last
  // core.hooksPath it reads wins.
  const configs = await Promise.all(
    [
      join(xdgConfig, 'git', 'config'),
      join(host.home, '.gitconfig'),
      join(checkout.commonDir, 'config'),
    ].map((path) => readFile(path, 'utf8').catch(() => '')),
  );

  const hooksPath =
    configs.map((config) => findHooksPath(config)).findLast((path) => path !== null) ?? null;

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

function findHooksPath(config: string): string | null {
  let isCore = false;
  let found: string | null = null;

  for (const line of config.split('\n')) {
    const header = /^\s*\[(?<section>[^\]]*)\]/u.exec(line)?.groups?.['section'];

    if (header !== undefined) {
      isCore = header.trim().toLowerCase() === 'core';
    } else if (isCore) {
      const value = /^\s*hookspath\s*=(?<value>.*)$/iu.exec(line)?.groups?.['value'];

      if (value !== undefined) {
        found = parseConfigValue(value);
      }
    }
  }

  return found;
}

// git expands a leading `~/` in a path value, and reads a relative one from
// the worktree root, where it runs the hooks.
function resolveHooksPath(path: string, worktree: string, home: string): string {
  return path.startsWith('~/') ? join(home, path.slice(2)) : resolve(worktree, path);
}
