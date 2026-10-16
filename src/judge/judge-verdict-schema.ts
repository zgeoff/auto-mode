import * as z from 'zod';

// The judge's structured output. A confirm holds no basis; an overturn names one.
export const judgeVerdictSchema = z.strictObject({
  verdict: z.enum(['confirm', 'overturn']),
  basis: z.enum(['consent', 'misread']).nullable(),
  reason: z.string().trim().min(1),
});
