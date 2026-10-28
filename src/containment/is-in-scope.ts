import { join, matchesGlob } from 'node:path';
import type { OwnedScope } from '../scope/types.ts';

export function isInScope(
  path: string,
  scope: Readonly<OwnedScope>,
  scratchPaths: readonly string[],
): boolean {
  if (
    scratchPaths.some((entry) => isUnder(path, entry)) ||
    scope.paths.some((owned) => isUnder(path, owned)) ||
    scope.pathGlobs.some((glob) => matchesGlob(path, glob))
  ) {
    return true;
  }

  return scope.worktrees.some((worktree) => {
    const isNested = isUnder(path, join(worktree, '.worktrees'));

    const isOtherOwned = scope.worktrees.some(
      (other) => other !== worktree && isUnder(path, other),
    );

    return isUnder(path, worktree) && (!isNested || isOtherOwned);
  });
}

function isUnder(path: string, root: string): boolean {
  const prefix = root.endsWith('/') ? root : `${root}/`;

  return path === root || path.startsWith(prefix);
}
