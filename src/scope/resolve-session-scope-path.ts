import { createHash } from 'node:crypto';
import { join } from 'node:path';

// One file per session, shared by its subagents: a worktree a subagent creates
// belongs to the session's task.
export function resolveSessionScopePath(stateDir: string, sessionID: string): string {
  const key = createHash('sha256').update(sessionID).digest('hex').slice(0, 32);

  return join(stateDir, 'session-scope', `${key}.json`);
}
