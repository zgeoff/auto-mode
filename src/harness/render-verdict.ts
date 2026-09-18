import { match } from 'ts-pattern';
import type { HookEvent, Verdict } from './types.ts';

export function renderVerdict(event: HookEvent, verdict: Verdict): string {
  const decision = match(verdict)
    .with({ kind: 'ask' }, () => ({ permissionDecision: 'ask' }))
    .with({ kind: 'allow' }, () => ({ permissionDecision: 'allow' }))
    .with({ kind: 'deny' }, (denied) => ({
      permissionDecision: 'deny',
      permissionDecisionReason: `[${denied.rule}] ${denied.reason}`,
    }))
    .exhaustive();

  return JSON.stringify({ hookSpecificOutput: { hookEventName: event, ...decision } });
}
