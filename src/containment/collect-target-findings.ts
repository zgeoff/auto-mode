import { join } from 'node:path';
import type { OwnedScope } from '../scope/types.ts';
import { resolveShellPath } from '../shell/resolve-shell-path.ts';
import { isInScope } from './is-in-scope.ts';
import type { ScopeFinding } from './types.ts';

// A target it cannot resolve, such as a path held in a variable, yields no
// finding, so the classifier still judges it.
export function collectTargetFindings(
  directory: string | null,
  target: string,
  scope: Readonly<OwnedScope>,
  scratchPaths: readonly string[],
): ScopeFinding[] {
  const path = resolveShellPath(directory, target, scope.home);

  if (path === null) {
    return [];
  }

  if (CREDENTIAL_PATHS.some((entry) => isUnder(path, join(scope.home, entry)))) {
    return [{ kind: 'credential', target: path }];
  }

  return isInScope(path, scope, scratchPaths)
    ? []
    : [{ kind: 'path', target: path, grant: { kind: 'path' } }];
}

const CREDENTIAL_PATHS = ['.ssh', '.aws', '.gnupg', '.gitconfig', '.netrc', '.npmrc', '.config/gh'];

function isUnder(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}
