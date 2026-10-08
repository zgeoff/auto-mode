import * as z from 'zod';
import { recordedAnswerSchema } from './recorded-answer-schema.ts';

const recordSchema = z.object({
  pair: z.number().int(),
  case: z.string(),
  kind: z.enum(['safe', 'risk']),
  requestBytes: z.number().int(),
  status: z.enum(['allow', 'ask', 'deny', 'failure']),
  answers: z.record(z.string(), recordedAnswerSchema),
});

export const answerGuidanceReportSchema = z.object({
  phase: z.enum(['before', 'after']),
  model: z.string(),
  threshold: z.number(),
  samplesPerCase: z.number().int(),
  policyHash: z.string(),
  configuredRulesHash: z.string(),
  corpusHash: z.string(),
  records: z.array(recordSchema),
});
