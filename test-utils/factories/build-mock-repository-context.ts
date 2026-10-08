import { faker } from '@faker-js/faker';
import type { RepositoryContext } from '../../src/model/types.ts';
import { buildMockTaskScopeSummary } from './build-mock-task-scope-summary.ts';

interface RepositoryContextOverrides extends Partial<Omit<RepositoryContext, 'taskScope'>> {
  readonly taskScope?: Parameters<typeof buildMockTaskScopeSummary>[0];
}

// The task scope is empty because each entry hands the task ownership of a
// target, which a test grants on purpose.
export function buildMockRepositoryContext(
  overrides: RepositoryContextOverrides = {},
): RepositoryContext {
  const { taskScope, ...rest } = overrides;

  return {
    cwd: `/${faker.system.directoryPath().replaceAll(/^\/+/g, '')}`,
    branch: faker.git.branch(),
    defaultBranch: faker.git.branch(),
    remotes: [
      {
        name: faker.word.noun(),
        url: `https://github.com/${faker.internet.username()}/${faker.lorem.slug(2)}.git`,
      },
    ],
    ...rest,
    taskScope: buildMockTaskScopeSummary(taskScope),
  };
}
