import type { ScopeFacts } from '../../src/scope/types.ts';

export function buildMockScopeFacts(overrides: Partial<ScopeFacts> = {}): ScopeFacts {
  return {
    worktrees: [],
    branches: [],
    pullRequests: [],
    pathGlobs: [],
    paths: [],
    replyChannels: [],
    ...overrides,
  };
}
