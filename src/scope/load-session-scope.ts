import * as z from 'zod';
import { loadJSONFile } from '../state/load-json-file.ts';
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

export function loadSessionScope(path: string): Promise<SessionScope> {
  return loadJSONFile(path, sessionScopeSchema, EMPTY_SESSION_SCOPE);
}
