import { createHash } from 'node:crypto';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import type { HostEnvironment } from '../config/types.ts';
import { resolveXDGDir } from '../state/resolve-xdg-dir.ts';

// The name hashes the build, so an upgrade starts a new server, and hashes the
// session, because a socket path has a short length limit.
export function resolveJudgeSocketPath(
  host: Readonly<HostEnvironment>,
  sessionID: string,
  entry: string,
): string {
  const runtime = host.env['XDG_RUNTIME_DIR'];

  const dir =
    runtime === undefined || runtime === ''
      ? join(resolveXDGDir(host, 'state'), 'judge')
      : join(runtime, 'auto-mode');

  const build = statSync(entry, { throwIfNoEntry: false });

  const name = createHash('sha256')
    .update(`${sessionID}\0${entry}\0${String(build?.mtimeMs ?? 0)}`)
    .digest('hex')
    .slice(0, 24);

  return join(dir, `judge-${name}.sock`);
}
