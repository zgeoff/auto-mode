import type { Verdict } from '../request/types.ts';
import type { DenialBudget, DenialState } from './types.ts';
import { EMPTY_DENIAL_STATE } from './types.ts';

export interface DenialPlan {
  readonly verdict: Verdict | null;
  readonly state: DenialState;
  readonly escalation: boolean;
}

export function planDenialBudget(
  state: Readonly<DenialState>,
  verdict: Readonly<Verdict> | null,
  retryKey: string,
  budget: Readonly<DenialBudget>,
): DenialPlan {
  if (verdict === null) {
    return { verdict: null, state, escalation: false };
  }

  if (verdict.kind === 'allow') {
    return { verdict, state: { ...state, consecutive: 0, lastDenied: null }, escalation: false };
  }

  // The prompt that writing nothing keeps is where the human answers, and the
  // next request can only arrive after that answer, so the counts reset here.
  if (state.consecutive >= budget.consecutive || state.session >= budget.perSession) {
    return { verdict: null, state: EMPTY_DENIAL_STATE, escalation: true };
  }

  const next: DenialState = {
    consecutive: state.consecutive + 1,
    session: state.session + 1,
    lastDenied: { retryKey, rule: verdict.rule, reason: verdict.reason },
  };

  const left = Math.min(budget.consecutive - next.consecutive, budget.perSession - next.session);

  return {
    verdict: { ...verdict, reason: `${verdict.reason} ${formatDenialsLeft(left)}` },
    state: next,
    escalation: false,
  };
}

function formatDenialsLeft(left: number): string {
  if (left > 0) {
    return `Denials left before auto-mode asks the user: ${left}.`;
  }

  return 'This is the last denial before auto-mode asks the user. Stop now, without finishing the rest of the task, and tell the user what consent you need to continue.';
}
