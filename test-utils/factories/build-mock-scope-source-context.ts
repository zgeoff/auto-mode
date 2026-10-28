import { faker } from '@faker-js/faker';
import { readTextFile } from '../../src/config/read-text-file.ts';
import type { ScopeSourceReader } from '../../src/scope/types.ts';

type ScopeSourceContext = Parameters<ScopeSourceReader>[0];

export function buildMockScopeSourceContext(
  overrides: Partial<ScopeSourceContext> = {},
): ScopeSourceContext {
  const worktree =
    overrides.worktree ?? `/${faker.system.directoryPath().replaceAll(/^\/+/gu, '')}`;

  return {
    env: {},
    sessionID: faker.string.uuid(),
    cwd: worktree,
    worktree,
    commonDir: `${worktree}/.git`,
    branch: faker.git.branch(),
    stateDir: `/${faker.system.directoryPath().replaceAll(/^\/+/gu, '')}`,
    stderr: { write: () => true },
    readTextFile,
    ...overrides,
  };
}
