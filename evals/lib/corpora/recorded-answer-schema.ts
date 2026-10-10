import * as z from 'zod';

const probability = z.number().min(0).max(1);

// An evaluation script records each rule's answer as its choice, its
// confidence, and the allow, block, and ask probabilities, in that order.
export const recordedAnswerSchema = z.tuple([
  z.enum(['allow', 'block', 'ask']),
  probability,
  probability,
  probability,
  probability,
]);

export type RecordedAnswer = Readonly<z.infer<typeof recordedAnswerSchema>>;
