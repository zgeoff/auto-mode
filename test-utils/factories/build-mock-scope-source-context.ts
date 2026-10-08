import { faker } from '@faker-js/faker';
import type { ScopeSourceReader } from '../../src/scope/types.ts';

type ScopeSourceContext = Parameters<ScopeSourceReader>[0];

// The atc record path and session ID stay absent: atc names them only for a
// session it tracks, which a test sets up on purpose. The cwd and the git
// directory follow the worktree, so a test that moves the worktree moves them.
export function buildMockScopeSourceContext(
  overrides: Partial<ScopeSourceContext> = {},
): ScopeSourceContext {
  const worktree = overrides.worktree ?? `/${faker.system.directoryPath().replaceAll(/^\/+/g, '')}`;

  return {
    env: {},
    sessionID: faker.string.uuid(),
    cwd: worktree,
    worktree,
    commonDir: `${worktree}/.git`,
    branch: faker.git.branch(),
    stateDir: `/${faker.system.directoryPath().replaceAll(/^\/+/g, '')}`,
    stderr: { write: () => true },
    ...overrides,
  };
}
