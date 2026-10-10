import type { DecisionContext } from '../request/types.ts';
import { buildBudgetOmittedContext } from './build-budget-omitted-context.ts';

export function buildTaskContext(context: DecisionContext): DecisionContext {
  let result: DecisionContext = {
    ...context,
    omittedTaskContext: [...context.omittedTaskContext],
  };

  for (const field of ['originalUserTask', 'delegatedTask'] as const) {
    const task = result[field];

    if (task !== null && Buffer.byteLength(task.text) > 4096) {
      result = buildBudgetOmittedContext(result, field);
    }
  }

  return result;
}
