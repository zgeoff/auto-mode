import type { SessionScope } from '../../src/scope/types.ts';

export function buildMockSessionScope(overrides: Partial<SessionScope> = {}): SessionScope {
  return { worktrees: [], branches: [], pullRequests: [], ...overrides };
}
