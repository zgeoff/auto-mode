import type { DecisionResponse } from '../../src/model/decision-response-schema.ts';

type DecisionAnswer = DecisionResponse['answers'][string];

interface DecisionAnswerOverrides extends Partial<Omit<DecisionAnswer, 'probabilities'>> {
  readonly probabilities?: Partial<DecisionAnswer['probabilities']>;
}

// The client rejects a distribution whose winner is not the choice, so the
// default is a certain allow and a test sets choice and probabilities together.
export function buildMockDecisionAnswer(overrides: DecisionAnswerOverrides = {}): DecisionAnswer {
  const { probabilities, ...rest } = overrides;

  return {
    type: 'choice',
    choice: 'allow',
    confidence: 1,
    ...rest,
    probabilities: { allow: 1, block: 0, ask: 0, ...probabilities },
  };
}
