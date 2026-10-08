import * as z from 'zod';
import type { ScopeRecordRequest } from '../scope/update-session-scope.ts';

// Strict for the same reason as the action request: the mod and the CLI ship
// together, and a shape either side does not know records nothing.
const recordSchema = z.strictObject({
  sessionID: z.string().min(1),
  cwd: z.string().min(1),
  startedAt: z.number().int().positive(),
  command: z.string().min(1),
  resultText: z.string(),
});

export function parseScopeRecordRequest(body: unknown): ScopeRecordRequest | null {
  const parsed = recordSchema.safeParse(body);

  return parsed.success ? parsed.data : null;
}
