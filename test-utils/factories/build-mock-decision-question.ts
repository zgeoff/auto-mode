import { faker } from '@faker-js/faker';
import type { DecisionRequest } from '../../src/model/types.ts';

type DecisionQuestion = DecisionRequest['questions'][string];

interface DecisionQuestionOverrides extends Partial<Omit<DecisionQuestion, 'criteria'>> {
  readonly criteria?: Partial<DecisionQuestion['criteria']>;
}

// Jev asks every question as a choice among allow, block, and ask.
export function buildMockDecisionQuestion(
  overrides: DecisionQuestionOverrides = {},
): DecisionQuestion {
  const { criteria, ...rest } = overrides;

  return {
    type: 'choice',
    instructions: faker.lorem.paragraph(),
    ...rest,
    criteria: {
      allow: faker.lorem.sentence(),
      block: faker.lorem.sentence(),
      ask: faker.lorem.sentence(),
      ...criteria,
    },
  };
}
