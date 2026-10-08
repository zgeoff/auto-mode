import * as z from 'zod';
import { recordedAnswerSchema } from './recorded-answer-schema.ts';

const recordSchema = z.object({
  pair: z.number().int(),
  action: z.enum(['push', 'pr-create', 'comment']),
  variant: z.enum(['unrelated-topic', 'earlier-consent']),
  arm: z.enum(['stale', 'null']),
  requestHash: z.string(),
  controlHash: z.string(),
  model: z.string(),
  status: z.enum(['allow', 'ask', 'deny']),
  rule: z.string().nullable(),
  answers: z.record(z.string(), recordedAnswerSchema),
});

export const staleConsentReportSchema = z.object({
  model: z.string(),
  threshold: z.number(),
  samplesPerCase: z.number().int(),
  retries: z.number().int(),
  corpusHash: z.string(),
  records: z.array(recordSchema),
});
