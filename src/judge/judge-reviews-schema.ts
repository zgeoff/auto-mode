import * as z from 'zod';

// A confirm holds no basis; an overturn names one.
const judgeReviewSchema = z.strictObject({
  rule: z.string(),
  verdict: z.enum(['confirm', 'overturn']),
  basis: z.enum(['consent', 'misread']).nullable(),
  reason: z.string().trim().min(1),
});

// The judge's answer to one prompted call: one review per deny, in the order
// the evidence lists them.
export const judgeReviewsSchema = z.strictObject({ reviews: z.array(judgeReviewSchema) });
