import type { Runtime } from '../config/types.ts';
import type { ActionRequest } from '../request/types.ts';
import { probeLauncherSpawner } from './probe-launcher-spawner.ts';

// A launcher passes a spawned session's opening prompt on the command line, and
// Claude Code reports it with the origin of a typed prompt.
export async function resolveOpeningPrompt(
  request: ActionRequest,
  runtime: Readonly<Pick<Runtime, 'host' | 'readTextFile'>>,
): Promise<ActionRequest> {
  const context = request.decisionContext;
  const message = context?.lastDirectUserMessage;

  if (context === undefined || message?.position !== 'opening') {
    return request;
  }

  const { position: _, ...unmarked } = message;

  const isSpawned = await probeLauncherSpawner(
    runtime.host.env['AUTO_MODE_SCOPE_FILE'],
    runtime.readTextFile,
  );

  return {
    ...request,
    decisionContext: { ...context, lastDirectUserMessage: isSpawned ? null : unmarked },
  };
}
