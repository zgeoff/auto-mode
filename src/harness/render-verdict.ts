import { match } from 'ts-pattern';
import type { HookEvent, Verdict } from './types.ts';

export function renderVerdict(event: HookEvent, verdict: Verdict): string | null {
  const decision = match(event)
    .with('PreToolUse', () => buildToolGateDecision(verdict))
    .with('PermissionRequest', () => buildPermissionDecision(verdict))
    .exhaustive();

  // an event that cannot carry the verdict renders nothing at all, and the
  // harness reads the silence as a hook with no opinion
  return decision === null
    ? null
    : JSON.stringify({ hookSpecificOutput: { hookEventName: event, ...decision } });
}

// PreToolUse runs before the harness has decided anything, so an ask on it is a
// decision of its own: it sends the call to a prompt the harness would have
// skipped.
function buildToolGateDecision(verdict: Verdict): Record<string, unknown> {
  return match(verdict)
    .with({ kind: 'ask' }, () => ({ permissionDecision: 'ask' }))
    .with({ kind: 'allow' }, () => ({ permissionDecision: 'allow' }))
    .with({ kind: 'deny' }, (denied) => ({
      permissionDecision: 'deny',
      permissionDecisionReason: formatReason(denied),
    }))
    .exhaustive();
}

// PermissionRequest fires once the harness is already on its way to the prompt,
// so its contract carries allow and deny and nothing else — the prompt is what
// happens when the hook answers nothing.
function buildPermissionDecision(verdict: Verdict): Record<string, unknown> | null {
  return match(verdict)
    .with({ kind: 'ask' }, () => null)
    .with({ kind: 'allow' }, () => ({ decision: { behavior: 'allow' } }))
    .with({ kind: 'deny' }, (denied) => ({
      decision: { behavior: 'deny', message: formatReason(denied) },
    }))
    .exhaustive();
}

type Denial = Extract<Verdict, { readonly kind: 'deny' }>;

// The reason reaches the agent verbatim, and it opens with the rule name so the
// agent and the user can both see which rule stopped the action.
function formatReason(denied: Denial): string {
  return `[${denied.rule}] ${denied.reason}`;
}
