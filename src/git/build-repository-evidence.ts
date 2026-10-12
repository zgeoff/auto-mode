import type { RepositoryContext, TaskScopeSummary } from '../types.ts';
import { buildRepositoryContext } from './build-repository-context.ts';
import type { CheckoutFacts } from './types.ts';

export function buildRepositoryEvidence(
  facts: Readonly<CheckoutFacts>,
  taskScope: Readonly<TaskScopeSummary> | undefined,
): RepositoryContext | null {
  const context = buildRepositoryContext(facts);

  if (taskScope === undefined) {
    return context;
  }

  return { ...(context ?? { cwd: facts.cwd, branch: null, defaultBranch: null }), taskScope };
}
