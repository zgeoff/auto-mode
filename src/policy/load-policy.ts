import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The line in the classifier file that the rule list replaces. */
const RULES_MARKER = '<rules>';

export interface PolicyPaths {
  /** The framework: how to judge. Defaults to the shipped `policy/classifier.md`. */
  readonly classifierPath?: string;
  /** The rule list: what to judge against. Defaults to the shipped `policy/rules.md`. */
  readonly rulesPath?: string;
}

/**
 * Reads the two policy files and splices them into the one system prompt the
 * model receives. Nothing else is added, so `auto-mode print-prompt` shows
 * exactly what the classifier reads.
 */
export async function loadPolicy(paths: PolicyPaths = {}): Promise<string> {
  const shipped = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'policy');
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
