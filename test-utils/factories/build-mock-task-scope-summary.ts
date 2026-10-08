import type { TaskScopeSummary } from '../../src/model/types.ts';

// Every list hands the task ownership of a target, so each starts empty and a
// test grants what its scenario needs.
export function buildMockTaskScopeSummary(
  overrides: Partial<TaskScopeSummary> = {},
): TaskScopeSummary {
  return { worktrees: [], branches: [], pullRequests: [], ...overrides };
}
