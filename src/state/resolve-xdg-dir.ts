import { join } from 'node:path';
import type { HostEnvironment } from '../config/types.ts';

const BASE_DIRS = {
  config: { variable: 'XDG_CONFIG_HOME', fallback: ['.config'] },
  state: { variable: 'XDG_STATE_HOME', fallback: ['.local', 'state'] },
} as const;

// An empty XDG variable counts as unset, as the base directory spec reads it.
export function resolveXDGDir(
  host: Readonly<HostEnvironment>,
  kind: keyof typeof BASE_DIRS,
): string {
  const directory = BASE_DIRS[kind];
  const base = host.env[directory.variable];
  const root = base === undefined || base === '' ? join(host.home, ...directory.fallback) : base;

  return join(root, 'auto-mode');
}
