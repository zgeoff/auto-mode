import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveShippedPolicyDir } from './resolve-shipped-policy-dir.ts';

export async function readDenialGuidance(
  policyDir: string = resolveShippedPolicyDir(),
): Promise<string> {
  const text = await readFile(join(policyDir, 'denial.md'), 'utf8');

  return text.trim();
}
