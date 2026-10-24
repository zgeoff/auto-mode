import * as z from 'zod';

export const judgeServerRequestSchema = z.strictObject({
  model: z.string().min(1),
  timeoutMs: z.number().int().positive(),
  system: z.string(),
  user: z.string(),
});
