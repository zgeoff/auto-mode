import { faker } from '@faker-js/faker';
import { buildMockActionRequest } from '../../../test-utils/factories/build-mock-action-request.ts';
import { buildMockRepositoryContext } from '../../../test-utils/factories/build-mock-repository-context.ts';
import type { MeasurementCase } from '../load-measurement-sets.ts';

// The case holds no recorded answers, so a replay test states the ones it needs.
export function buildMockMeasurementCase(
  overrides: Partial<MeasurementCase> = {},
): MeasurementCase {
  return {
    id: faker.string.alphanumeric(8),
    action: buildMockActionRequest({ decisionContext: undefined }),
    lastUserMessage: null,
    repository: buildMockRepositoryContext(),
    mcpServers: [],
    configuredRules: null,
    recorded: {},
    ...overrides,
  };
}
