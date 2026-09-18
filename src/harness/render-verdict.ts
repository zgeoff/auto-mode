import type { HookEvent, Verdict } from './types.ts';

export function renderVerdict(event: HookEvent, verdict: Verdict): string {
  if (verdict.kind === 'ask') {
    return JSON.stringify({
      hookSpecificOutput: { hookEventName: event, permissionDecision: 'ask' },
    });
  }

  if (verdict.kind === 'allow') {
    return JSON.stringify({
      hookSpecificOutput: { hookEventName: event, permissionDecision: 'allow' },
    });
  }

  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: event,
      permissionDecision: 'deny',
      permissionDecisionReason: `[${verdict.rule}] ${verdict.reason}`,
    },
  });
}
