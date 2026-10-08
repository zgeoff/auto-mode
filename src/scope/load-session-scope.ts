import { readFile } from 'node:fs/promises';
import * as z from 'zod';
import type { ScopeFacts } from './types.ts';
import { EMPTY_SCOPE_FACTS } from './types.ts';

const name = z.string().min(1);

const pullRequestSchema = z.strictObject({
  number: z.number().int().positive(),
  head: name,
  repository: name,
});

const sessionScopeSchema = z.strictObject({
  worktrees: z.array(name),
  branches: z.array(name),
  pullRequests: z.array(pullRequestSchema),
});

// A missing or unreadable file is a session that has created nothing yet; the
// containment check then errs toward a deny, never toward an allow.
export async function loadSessionScope(path: string): Promise<ScopeFacts> {
  let raw: string;

  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return EMPTY_SCOPE_FACTS;
  }

  try {
    const parsed = sessionScopeSchema.safeParse(JSON.parse(raw));

    return parsed.success ? { ...parsed.data, pathGlobs: [] } : EMPTY_SCOPE_FACTS;
  } catch {
    return EMPTY_SCOPE_FACTS;
  }
}
