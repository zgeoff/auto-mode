import type { OwnedScope } from '../containment/collect-scope-findings.ts';
import type { TaskScopeSummary } from './types.ts';

export function buildTaskScopeSummary(scope: Readonly<OwnedScope>): TaskScopeSummary {
  return {
    worktrees: scope.worktrees,
    branches: scope.branches,
    pullRequests: scope.pullRequests.map((pull) => ({
      repository: pull.repository,
      number: pull.number,
    })),
  };
}
