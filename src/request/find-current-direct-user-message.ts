import type { DecisionContext } from './types.ts';

export function findCurrentDirectUserMessage(context: DecisionContext | undefined): string | null {
  if (context === undefined || context.agentID !== null) {
    return null;
  }

  const message = context.lastDirectUserMessage;

  return message === null || message.freshness === 'stale' ? null : message.text;
}
