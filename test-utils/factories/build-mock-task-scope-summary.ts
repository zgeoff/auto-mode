import type { TaskScopeSummary } from '../../src/types.ts';

export function buildMockTaskScopeSummary(
  overrides: Partial<TaskScopeSummary> = {},
): TaskScopeSummary {
  return { worktrees: [], branches: [], pullRequests: [], ...overrides };
}
