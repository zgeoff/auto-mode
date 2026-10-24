import { faker } from '@faker-js/faker';
import type { DecisionResult, RecordedDecisionChoice } from '../../src/model/types.ts';
import { buildMockRecordedDecisionAnswer } from './build-mock-recorded-decision-answer.ts';

type RecordedDecisionResult = DecisionResult<RecordedDecisionChoice>;

export function buildMockRecordedDecisionResult(
  overrides: Partial<RecordedDecisionResult> = {},
): RecordedDecisionResult {
  return {
    model: faker.lorem.slug(2),

    answers: { rule_0: buildMockRecordedDecisionAnswer({ choice: 'allow', confidence: 1 }) },
    inputTokens: faker.number.int({ min: 1, max: 10_000 }),
    requestBytes: faker.number.int({ min: 1, max: 100_000 }),
    ...overrides,
  };
}
