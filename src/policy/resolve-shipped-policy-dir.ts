import { existsSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';

export function resolveShippedPolicyDir(): string {
  // tsdown flattens dist/ while the source stays nested, so a fixed `..` count
  // is right for only one of the two layouts. Walk up instead.
  let dir = import.meta.dirname;

  for (;;) {
    if (existsSync(join(dir, 'policy', 'classifier.md'))) {
      return join(dir, 'policy');
    }

    const parent = dirname(dir);

    if (parent === dir || dir === parse(dir).root) {
      throw new Error('auto-mode cannot find its shipped policy/ directory');
    }

    dir = parent;
  }
}
