import { loadRepositoryContext } from './load-repository-context.ts';
import type { RepositoryContext, TaskScopeSummary } from './types.ts';

export async function loadRepositoryEvidence(
  cwd: string,
  taskScope: Readonly<TaskScopeSummary> | undefined,
): Promise<RepositoryContext | null> {
  const context = await loadRepositoryContext(cwd);

  return context === null || taskScope === undefined ? context : { ...context, taskScope };
}
