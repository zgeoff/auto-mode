import type { OutputStream } from '../config/types.ts';
import { loadDenialState } from './load-denial-state.ts';
import type { DenialPlan } from './plan-denial-budget.ts';
import type { DenialState } from './types.ts';
import { updateDenialState } from './update-denial-state.ts';

export async function tryUpdateDenialBudget(
  stderr: Readonly<OutputStream>,
  path: string,
  plan: (state: Readonly<DenialState>) => DenialPlan,
): Promise<DenialPlan> {
  const unlocked = await loadDenialState(path);

  const unlockedPlan = plan(unlocked);

  if (unlockedPlan.state === unlocked) {
    return unlockedPlan;
  }

  try {
    const updated = await updateDenialState(path, (state) => plan(state).state);

    return plan(updated.previous);
  } catch {
    stderr.write('auto-mode: denial counts unavailable\n');

    return unlockedPlan;
  }
}
