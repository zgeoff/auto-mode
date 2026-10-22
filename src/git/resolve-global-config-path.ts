import { resolve } from 'node:path';

// git moves to the worktree root before it reads its config, so it reads a
// relative GIT_CONFIG_GLOBAL from there. An empty one names no file, and git
// reads no user config.
export function resolveGlobalConfigPath(value: string, worktree: string): string {
  return value === '' ? '' : resolve(worktree, value);
}
