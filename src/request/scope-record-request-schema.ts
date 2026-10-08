import * as z from 'zod';

// Strict for the same reason as the action request: the mod and the CLI ship
// together, and a shape either side does not know records nothing.
export const scopeRecordRequestSchema = z.strictObject({
  sessionID: z.string().min(1),
  cwd: z.string().min(1),
  startedAt: z.number().int().positive(),
  command: z.string().min(1),
  resultText: z.string(),
});
