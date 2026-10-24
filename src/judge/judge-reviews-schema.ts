import * as z from 'zod';

const judgeReviewSchema = z.strictObject({
  rule: z.string(),
  verdict: z.enum(['confirm', 'overturn']),
  basis: z.enum(['consent', 'misread']).nullable(),
  reason: z.string().trim().min(1),
});

export const judgeReviewsSchema = z.strictObject({ reviews: z.array(judgeReviewSchema) });
