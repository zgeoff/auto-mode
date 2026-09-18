import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, parse } from 'node:path';

const RULES_MARKER = '<rules>';

export interface PolicyPaths {
  readonly classifierPath?: string | undefined;
  readonly rulesPath?: string | undefined;
}

export async function loadPolicy(paths: PolicyPaths = {}): Promise<string> {
  const shipped = findShippedPolicyDir();
  const classifierPath = paths.classifierPath ?? join(shipped, 'classifier.md');
  const rulesPath = paths.rulesPath ?? join(shipped, 'rules.md');

  const [classifier, rules] = await Promise.all([
    readFile(classifierPath, 'utf8'),
    readFile(rulesPath, 'utf8'),
  ]);

  if (!classifier.includes(RULES_MARKER)) {
    throw new Error(`${classifierPath} has no ${RULES_MARKER} line, so the rules cannot be placed`);
  }

  return classifier.replace(RULES_MARKER, rules.trim());
}

function findShippedPolicyDir(): string {
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
