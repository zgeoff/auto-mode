import type { HookEvent, Verdict } from './types.ts';

/**
 * Turns a verdict into the JSON the harness reads on stdout.
 *
 * All three harnesses take the same shape, because Codex and Muse both model
 * their hook contract on Claude's. `allow` and `ask` differ: `allow` runs the
 * tool with no prompt, while `ask` falls through to whatever the harness would
 * have done on its own, which is usually to ask the operator.
 */
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
