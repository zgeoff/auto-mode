import { join } from 'node:path';
import type { HostEnvironment } from './types.ts';

// Claude Code keeps settings.json in ~/.claude and .claude.json in the home
// directory itself; CLAUDE_CONFIG_DIR moves both into the directory it names.
const DEFAULT_DIRS = { 'settings.json': ['.claude'], '.claude.json': [] } as const;

export function resolveClaudeConfigPath(
  host: Readonly<HostEnvironment>,
  file: keyof typeof DEFAULT_DIRS,
): string {
  const configDir = host.env['CLAUDE_CONFIG_DIR'];

  const dir =
    configDir === undefined || configDir === ''
      ? join(host.home, ...DEFAULT_DIRS[file])
      : configDir;

  return join(dir, file);
}
