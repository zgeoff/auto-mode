import type { OutputStream } from '../config/types.ts';
import { loadDenialState } from './load-denial-state.ts';
import type { DenialPlan } from './plan-denial-budget.ts';
import type { DenialState } from './types.ts';
import { updateDenialState } from './update-denial-state.ts';

// A plan that changes no count, such as a defer's, takes no lock and writes
// nothing. A lock or write failure keeps the verdict and plans from the read
// taken before the lock, so this call's count can be lost but never doubled.
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
