import type { TaskScopeSummary } from '../../types.ts';

export function buildMockTaskScopeSummary(
  overrides: Partial<TaskScopeSummary> = {},
): TaskScopeSummary {
  return { worktrees: [], branches: [], pullRequests: [], ...overrides };
}
