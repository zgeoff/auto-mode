import { faker } from '@faker-js/faker';
import type { TaskScopeSessions } from '../corpora/task-scope-sessions-schema.ts';

// Each list and map grants the sessions a checkout, a branch, a PR head or a
// session to replay, which a test supplies on purpose, so each starts empty.
export function buildMockTaskScopeSessions(
  overrides: Partial<TaskScopeSessions> = {},
): TaskScopeSessions {
  return {
    home: `/${faker.system.directoryPath().replaceAll(/^\/+/g, '')}`,
    remotes: [],
    worktreeBranches: {},
    pullRequestHeads: {},
    atc: {},
    sessions: [],
    ...overrides,
  };
}
