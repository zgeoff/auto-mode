import { buildBudgetOmittedContext } from './build-budget-omitted-context.ts';
import type { DecisionInput } from './types.ts';

export interface SizedDecisionInput<Choice extends string> {
  readonly input: {
    readonly model: string;
    readonly state: DecisionInput<Choice>['state'];
    readonly questions: DecisionInput<Choice>['questions'];
  };
  readonly body: string;
}

export function buildSizedDecisionInput<Choice extends string>(
  model: string,
  request: Readonly<DecisionInput<Choice>>,
): SizedDecisionInput<Choice> {
  const whole = buildInput(model, request.state, request.questions);
  const withoutDelegated = buildFittedInput(whole, 'delegatedTask');

  return buildFittedInput(withoutDelegated, 'originalUserTask');
}

function buildInput<Choice extends string>(
  model: string,
  state: DecisionInput<Choice>['state'],
  questions: DecisionInput<Choice>['questions'],
): SizedDecisionInput<Choice> {
  const input = { model, state, questions };

  return { input, body: JSON.stringify(input) };
}

export const MAX_DECISION_BYTES = 100_000;

function buildFittedInput<Choice extends string>(
  sized: SizedDecisionInput<Choice>,
  field: 'delegatedTask' | 'originalUserTask',
): SizedDecisionInput<Choice> {
  const context = sized.input.state.taskContext;

  if (
    Buffer.byteLength(sized.body) <= MAX_DECISION_BYTES ||
    context === undefined ||
    context[field] === null
  ) {
    return sized;
  }

  return buildInput(
    sized.input.model,
    { ...sized.input.state, taskContext: buildBudgetOmittedContext(context, field) },
    sized.input.questions,
  );
}
