import type { ModRequest } from '../../mods/auto-mode/contract/types.ts';
import type { ParsedActionRequest } from './types.ts';

export function toModRequest(request: ParsedActionRequest): ModRequest {
  const context = request.decisionContext;

  return {
    sessionID: request.sessionID,
    ...(request.toolUseID === undefined ? {} : { toolUseID: request.toolUseID }),
    cwd: request.cwd,
    toolName: request.toolName,
    toolInput: request.toolInput,
    context: { ...context, omittedTaskContext: [...context.omittedTaskContext] },
  };
}
