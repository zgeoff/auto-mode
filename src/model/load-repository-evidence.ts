import { resolve } from 'node:path';
import type { HostEnvironment } from '../config/types.ts';
import { loadRepositoryContext } from './load-repository-context.ts';
import type { RepositoryContext, TaskScopeSummary } from './types.ts';

export async function loadRepositoryEvidence(
  cwd: string,
  taskScope: Readonly<TaskScopeSummary> | undefined,
  env: HostEnvironment['env'],
): Promise<RepositoryContext | null> {
  const context = await loadRepositoryContext(cwd, env);

  if (taskScope === undefined) {
    return context;
  }

  return { ...(context ?? { cwd: resolve(cwd), branch: null, defaultBranch: null }), taskScope };
}
