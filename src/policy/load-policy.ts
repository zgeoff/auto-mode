import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveShippedPolicyDir } from './resolve-shipped-policy-dir.ts';

const RULES_MARKER = '<rules>';

export interface PolicyPaths {
  readonly classifierPath?: string | undefined;
  readonly rulesPath?: string | undefined;
}

export async function loadPolicy(
  paths: PolicyPaths = {},
  framework: 'classifier.md' | 'decision.md' = 'classifier.md',
): Promise<string> {
  const shipped = resolveShippedPolicyDir();
  const classifierPath = paths.classifierPath ?? join(shipped, framework);
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
