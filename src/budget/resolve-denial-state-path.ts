import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { ActionRequest } from '../request/types.ts';

export function resolveDenialStatePath(request: Readonly<ActionRequest>, stateDir: string): string {
  const agentID = request.decisionContext?.agentID ?? '';

  const key = createHash('sha256')
    .update(`${request.sessionID}\0${agentID}`)
    .digest('hex')
    .slice(0, 32);

  return join(stateDir, 'denials', `${key}.json`);
}
