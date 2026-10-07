import type { DecisionContext } from '../request/types.ts';

export function buildTaskContext(context: DecisionContext): DecisionContext {
  const result = {
    ...context,
    lastDirectUserMessage: context.agentID === null ? context.lastDirectUserMessage : null,
    omittedTaskContext: [...context.omittedTaskContext],
  };

  for (const field of ['originalUserTask', 'delegatedTask'] as const) {
    const task = result[field];

    if (task !== null && Buffer.byteLength(task.text) > 4096) {
      result[field] = null;
      result.omittedTaskContext = result.omittedTaskContext.filter((item) => item.field !== field);

      result.omittedTaskContext.push({ field, reason: 'budget' });
    }
  }

  return result;
}
