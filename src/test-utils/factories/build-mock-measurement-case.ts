import { faker } from '@faker-js/faker';
import type { MeasurementCase } from '../../measure/load-measurement-sets.ts';
import { buildMockActionRequest } from './build-mock-action-request.ts';
import { buildMockRepositoryContext } from './build-mock-repository-context.ts';

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
