export interface StubRepositoryMembership {
  readonly isInRepository: (path: string) => boolean;
}

export function buildStubRepositoryMembership(root: string): StubRepositoryMembership {
  return {
    isInRepository: (path) => path === root || path.startsWith(`${root}/`),
  };
}
