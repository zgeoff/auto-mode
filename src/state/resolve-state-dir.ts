import { join } from 'node:path';
import type { HostEnvironment } from '../config/types.ts';

export function resolveStateDir(host: Readonly<HostEnvironment>): string {
  const stateHome = host.env['XDG_STATE_HOME'];

  const base =
    stateHome === undefined || stateHome === '' ? join(host.home, '.local', 'state') : stateHome;

  return join(base, 'auto-mode');
}
