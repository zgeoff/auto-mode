export interface StubRepositoryMembership {
  readonly isInRepository: (path: string) => boolean;
}

// Stands in for git's answer to whether a path shares the action repository:
// the repository's root and every path below it do, and no other path does.
export function buildStubRepositoryMembership(root: string): StubRepositoryMembership {
  return {
    isInRepository: (path) => path === root || path.startsWith(`${root}/`),
  };
}
