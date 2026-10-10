import * as z from 'zod';
import type { DecisionChoice } from './types.ts';

export function buildDecisionResponseSchema<const Choice extends string>(
  choices: readonly [Choice, ...Choice[]],
) {
  const probability = z.number().min(0).max(1);

  const answerSchema = z.object({
    type: z.literal('choice'),
    choice: z.enum(choices),
    confidence: probability,
    probabilities: z.record(z.enum(choices), probability),
  });

  return z.object({
    model: z.string().min(1),
    answers: z.record(z.string(), answerSchema),
    usage: z.object({ input_tokens: z.number().int().nonnegative() }),
  });
}

export type DecisionResponse = z.input<
  ReturnType<typeof buildDecisionResponseSchema<DecisionChoice>>
>;
