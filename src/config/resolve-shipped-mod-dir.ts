import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { resolveShippedPolicyDir } from '../policy/resolve-shipped-policy-dir.ts';

export function resolveShippedModDir(startDir: string = import.meta.dirname): string {
  const modDir = join(dirname(resolveShippedPolicyDir(startDir)), 'mods', 'auto-mode');

  if (!existsSync(join(modDir, '.claude-plugin', 'plugin.json'))) {
    throw new Error('auto-mode cannot find its shipped mod');
  }

  return modDir;
}
