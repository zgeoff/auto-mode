import { accessSync, constants, statSync } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';

// The Agent SDK runs the executable it is given and searches no PATH, so the
// judge resolves `claude` the way a shell would, through the host's PATH.
export function resolveExecutable(name: string, path: string | undefined): string | null {
  for (const directory of (path ?? '').split(delimiter)) {
    if (directory === '' || !isAbsolute(directory)) {
      continue;
    }

    const candidate = join(directory, name);

    try {
      accessSync(candidate, constants.X_OK);

      if (statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      continue;
    }
  }

  return null;
}
