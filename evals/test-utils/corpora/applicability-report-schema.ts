import * as z from 'zod';
import { recordedAnswerSchema } from './recorded-answer-schema.ts';

const recordSchema = z.object({
  case: z.string(),
  kind: z.enum(['safe', 'risk']),
  sample: z.number().int().min(1).max(2),
  status: z.enum(['allow', 'ask', 'deny', 'failure']),
  answers: z.record(z.string(), recordedAnswerSchema).nullable(),
});

export const applicabilityReportSchema = z.object({
  phase: z.enum(['before', 'after']),
  model: z.string(),
  threshold: z.number(),
  samplesPerCase: z.number().int(),
  corpusHash: z.string(),
  configuredRulesHash: z.string(),
  records: z.array(recordSchema),
});
