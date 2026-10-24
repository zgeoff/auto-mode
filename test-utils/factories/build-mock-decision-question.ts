import { faker } from '@faker-js/faker';
import type { DecisionRequest } from '../../src/model/types.ts';

type DecisionQuestion = DecisionRequest['questions'][string];

interface DecisionQuestionOverrides extends Partial<Omit<DecisionQuestion, 'criteria'>> {
  readonly criteria?: Partial<DecisionQuestion['criteria']>;
}

export function buildMockDecisionQuestion(
  overrides: DecisionQuestionOverrides = {},
): DecisionQuestion {
  const { criteria, ...rest } = overrides;

  return {
    // Jev asks every question as a choice between allow and block
    type: 'choice',
    instructions: faker.lorem.paragraph(),
    ...rest,
    criteria: {
      allow: faker.lorem.sentence(),
      block: faker.lorem.sentence(),
      ...criteria,
    },
  };
}
