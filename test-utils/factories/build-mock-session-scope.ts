import type { SessionScope } from '../../src/scope/types.ts';

// Every list grants the session ownership of a target, so each starts empty and
// a test records what its scenario needs.
export function buildMockSessionScope(overrides: Partial<SessionScope> = {}): SessionScope {
  return { worktrees: [], branches: [], pullRequests: [], ...overrides };
}
