import { createHash } from 'node:crypto';
import { join } from 'node:path';

export function resolveSessionScopePath(stateDir: string, sessionID: string): string {
  const key = createHash('sha256').update(sessionID).digest('hex').slice(0, 32);

  return join(stateDir, 'session-scope', `${key}.json`);
}
