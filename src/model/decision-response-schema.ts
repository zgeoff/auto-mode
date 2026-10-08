import * as z from 'zod';

const probability = z.number().min(0).max(1);

const answerSchema = z.object({
  type: z.literal('choice'),
  choice: z.enum(['allow', 'block', 'ask']),
  confidence: probability,
  probabilities: z.strictObject({ allow: probability, block: probability, ask: probability }),
});

export const decisionResponseSchema = z.object({
  model: z.string().min(1),
  answers: z.record(z.string(), answerSchema),
  usage: z.object({ input_tokens: z.number().int().nonnegative() }),
});

export type DecisionResponse = z.input<typeof decisionResponseSchema>;
