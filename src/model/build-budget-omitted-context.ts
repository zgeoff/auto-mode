import type { DecisionContext } from '../request/types.ts';

export function buildBudgetOmittedContext(
  context: DecisionContext,
  field: 'originalUserTask' | 'delegatedTask',
): DecisionContext {
  return {
    ...context,
    [field]: null,
    omittedTaskContext: [
      ...context.omittedTaskContext.filter((item) => item.field !== field),
      { field, reason: 'budget' },
    ],
  };
}
