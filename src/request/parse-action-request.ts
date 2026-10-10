import { actionRequestSchema } from './action-request-schema.ts';
import type { ParsedActionRequest } from './types.ts';

export function parseActionRequest(body: unknown): ParsedActionRequest | null {
  const parsed = actionRequestSchema.safeParse(body);

  if (!parsed.success) {
    return null;
  }

  const context = parsed.data.context;

  return {
    sessionID: parsed.data.sessionID,
    toolUseID: parsed.data.toolUseID,
    cwd: parsed.data.cwd,
    toolName: parsed.data.toolName,
    toolInput: parsed.data.toolInput,
    decisionContext: {
      ...context,
      lastDirectUserMessage: context.agentID === null ? context.lastDirectUserMessage : null,
    },
  };
}
