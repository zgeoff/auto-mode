import { randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { loadSessionScope } from './load-session-scope.ts';
import { mergeScopeFacts } from './merge-scope-facts.ts';
import type { ScopeFacts } from './types.ts';

export async function writeSessionScope(path: string, added: Readonly<ScopeFacts>): Promise<void> {
  const merged = mergeScopeFacts([await loadSessionScope(path), added]);
  const staged = `${path}.${randomUUID()}.tmp`;

  const stored = {
    worktrees: merged.worktrees,
    branches: merged.branches,
    pullRequests: merged.pullRequests,
  };

  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(staged, `${JSON.stringify(stored)}\n`, { mode: 0o600 });
  await rename(staged, path);
}
