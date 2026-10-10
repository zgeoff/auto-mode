import { probabilitySchema } from 'auto-mode/eval';
import * as z from 'zod';

// An evaluation script records each rule's answer as its choice, its
// confidence, and the allow, block, and ask probabilities, in that order.
export const recordedAnswerSchema = z.tuple([
  z.enum(['allow', 'block', 'ask']),
  probabilitySchema,
  probabilitySchema,
  probabilitySchema,
  probabilitySchema,
]);

export type RecordedAnswer = Readonly<z.infer<typeof recordedAnswerSchema>>;
