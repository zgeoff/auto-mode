import * as z from 'zod';

export const judgeVerdictSchema = z.strictObject({
  verdict: z.enum(['confirm', 'overturn']),
  basis: z.enum(['consent', 'misread']).nullable(),
  reason: z.string().trim().min(1),
});
