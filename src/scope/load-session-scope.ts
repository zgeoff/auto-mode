import { readFile } from 'node:fs/promises';
import * as z from 'zod';
import type { SessionScope } from './types.ts';
import { EMPTY_SESSION_SCOPE } from './types.ts';

const name = z.string().min(1);

const pullRequestSchema = z.strictObject({
  number: z.number().int().positive(),
  head: name,
  repository: name,
});

const branchSchema = z.strictObject({ name, commonDir: name });

const sessionScopeSchema = z.strictObject({
  worktrees: z.array(name),
  branches: z.array(branchSchema),
  pullRequests: z.array(pullRequestSchema),
});

// A missing or unreadable file is a session that has created nothing yet; the
// containment check then errs toward a deny, never toward an allow.
export async function loadSessionScope(path: string): Promise<SessionScope> {
  let raw: string;

  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return EMPTY_SESSION_SCOPE;
  }

  try {
    const parsed = sessionScopeSchema.safeParse(JSON.parse(raw));

    return parsed.success ? parsed.data : EMPTY_SESSION_SCOPE;
  } catch {
    return EMPTY_SESSION_SCOPE;
  }
}
