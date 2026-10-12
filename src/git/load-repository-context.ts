import type { HostEnvironment } from '../config/types.ts';
import type { RepositoryContext } from '../types.ts';
import { buildRepositoryContext } from './build-repository-context.ts';
import { loadCheckoutFacts } from './load-checkout-facts.ts';

export async function loadRepositoryContext(
  cwd: string,
  env: HostEnvironment['env'],
  stopDir?: string,
): Promise<RepositoryContext | null> {
  const facts = await loadCheckoutFacts(cwd, env, { stopDir });

  return buildRepositoryContext(facts);
}
