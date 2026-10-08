import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { ActionRequest } from '../request/types.ts';
import { resolveStateDir } from '../state/resolve-state-dir.ts';

// A subagent keeps its own count, so the key is the session and the agent.
export function resolveDenialStatePath(request: Readonly<ActionRequest>): string {
  const agentID = request.decisionContext?.agentID ?? '';

  const key = createHash('sha256')
    .update(`${request.sessionID}\0${agentID}`)
    .digest('hex')
    .slice(0, 32);

  return join(resolveStateDir(), 'denials', `${key}.json`);
}
