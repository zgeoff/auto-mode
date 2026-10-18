import { existsSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';

export function resolveShippedPolicyDir(
  startDir: string = import.meta.dirname,
  stopDir: string = parse(startDir).root,
): string {
  // tsdown flattens dist/ while the source stays nested, so a fixed `..` count
  // is right for only one of the two layouts. Walk up instead.
  let directory = startDir;

  for (;;) {
    if (existsSync(join(directory, 'policy', 'decision.md'))) {
      return join(directory, 'policy');
    }

    const parent = dirname(directory);

    if (parent === directory || directory === stopDir) {
      throw new Error('auto-mode cannot find its shipped policy/ directory');
    }

    directory = parent;
  }
}
