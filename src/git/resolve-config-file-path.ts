import { resolve } from 'node:path';

// git moves to the worktree root before it reads its config, so it reads a
// relative GIT_CONFIG_GLOBAL or GIT_CONFIG_SYSTEM from there. An empty one
// names no file, and git reads no config for that layer.
export function resolveConfigFilePath(value: string, worktree: string): string {
  return value === '' ? '' : resolve(worktree, value);
}
