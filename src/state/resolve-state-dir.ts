import { homedir } from 'node:os';
import { join } from 'node:path';

export function resolveStateDir(): string {
  const stateHome = process.env['XDG_STATE_HOME'];

  const base =
    stateHome === undefined || stateHome === '' ? join(homedir(), '.local', 'state') : stateHome;

  return join(base, 'auto-mode');
}
