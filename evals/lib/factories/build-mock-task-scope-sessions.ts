import { faker } from '@faker-js/faker';
import type { TaskScopeSessions } from '../corpora/task-scope-sessions-schema.ts';

export function buildMockTaskScopeSessions(
  overrides: Partial<TaskScopeSessions> = {},
): TaskScopeSessions {
  return {
    home: `/${faker.system.directoryPath().replaceAll(/^\/+/gu, '')}`,
    remotes: [],
    worktreeBranches: {},
    pullRequestHeads: {},
    scopeFiles: {},
    sessions: [],
    ...overrides,
  };
}
