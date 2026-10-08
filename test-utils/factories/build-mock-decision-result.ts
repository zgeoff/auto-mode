import { faker } from '@faker-js/faker';
import type { DecisionResult } from '../../src/model/types.ts';
import { buildMockDecisionAnswer } from './build-mock-decision-answer.ts';

// One certain allow on the first shipped rule: the answers decide the verdict,
// so a test that needs another verdict states its answers.
export function buildMockDecisionResult(overrides: Partial<DecisionResult> = {}): DecisionResult {
  return {
    model: faker.lorem.slug(2),
    answers: { rule_0: buildMockDecisionAnswer({ choice: 'allow', confidence: 1 }) },
    inputTokens: faker.number.int({ min: 1, max: 10_000 }),
    requestBytes: faker.number.int({ min: 1, max: 100_000 }),
    ...overrides,
  };
}
