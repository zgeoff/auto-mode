import * as z from 'zod';

export const scopeRecordRequestSchema = z.strictObject({
  sessionID: z.string().min(1),
  cwd: z.string().min(1),
  startedAt: z.number().int().positive(),
  command: z.string().min(1),
  resultText: z.string(),
});
