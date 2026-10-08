import { faker } from '@faker-js/faker';
import type { EvaluationCase } from '../../src/evaluation/load-second-judge-corpus.ts';
import { buildMockRepositoryContext } from './build-mock-repository-context.ts';

interface EvaluationCaseOverrides extends Partial<Omit<EvaluationCase, 'repositoryContext'>> {
  readonly repositoryContext?: Parameters<typeof buildMockRepositoryContext>[0];
}

export function buildMockEvaluationCase(overrides: EvaluationCaseOverrides = {}): EvaluationCase {
  const { repositoryContext, ...rest } = overrides;

  return {
    id: faker.string.alphanumeric(8),
    source: 'real',
    label: 'safe',
    name: faker.lorem.words(3),
    tool: 'Bash',
    input: { command: faker.git.commitMessage() },
    lastUserMessage: faker.lorem.sentence(),
    ...rest,
    repositoryContext: buildMockRepositoryContext(repositoryContext),
  };
}
