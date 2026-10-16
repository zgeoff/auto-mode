import { join, matchesGlob } from 'node:path';
import type { OwnedScope } from '../scope/types.ts';

// A worktree nested under another, as `.worktrees/<name>` is, belongs to its own
// task: being inside the parent checkout does not put it in the parent's scope.
export function isInScope(
  path: string,
  scope: Readonly<OwnedScope>,
  scratchPaths: readonly string[],
): boolean {
  if (
    scratchPaths.some((entry) => isUnder(path, entry)) ||
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
  return path === root || path.startsWith(`${root}/`);
}
