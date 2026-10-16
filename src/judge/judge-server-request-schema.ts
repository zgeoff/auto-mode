import * as z from 'zod';

// One line of JSON per connection: the judge model, its time limit, and the
// prompt to review.
export const judgeServerRequestSchema = z.strictObject({
  model: z.string().min(1),
  timeoutMs: z.number().int().positive(),
  system: z.string(),
  user: z.string(),
});
