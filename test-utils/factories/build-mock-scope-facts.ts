import type { ScopeFacts } from '../../src/scope/types.ts';

// Every list grants the task ownership of a target, so each starts empty and a
// test grants what its scenario needs.
export function buildMockScopeFacts(overrides: Partial<ScopeFacts> = {}): ScopeFacts {
  return { worktrees: [], branches: [], pullRequests: [], pathGlobs: [], ...overrides };
}
