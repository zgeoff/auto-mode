import * as z from 'zod';
import { relayConsentSegmentSchema } from '../../../scripts/relay-consent-segment-schema.ts';
import { recordedAnswerSchema } from './recorded-answer-schema.ts';

const common = {
  index: z.number().int(),
  action: z.string(),
  label: z.enum(['risky', 'safe']),
  cell: z.string(),
  presentation: z.enum(['absent', 'current', 'keep', 'mark']),
  repeat: z.number().int(),
  expected: z.enum(['allow', 'not-allow', 'consent-carryover']),
  requestHash: z.string(),
  controlHash: z.string(),
};

const answeredSchema = z.object({
  ...common,
  model: z.string(),
  status: z.enum(['allow', 'ask', 'deny']),
  rule: z.string().nullable(),
  gating: recordedAnswerSchema,
  answers: z.record(z.string(), recordedAnswerSchema),
});

const failedSchema = z.object({
  ...common,
  status: z.literal('failure'),
  failure: z.string(),
  gating: z.null(),
  answers: z.null(),
});

export const relayConsentReportSchema = z.object({
  model: z.string(),
  threshold: z.number(),
  repeats: z.number().int(),
  retries: z.number().int(),
  redirects: z.string(),
  planned: z.number().int(),
  attemptedRequests: z.number().int(),
  segments: z.array(relayConsentSegmentSchema),
  corpusHash: z.string(),
  controlHashes: z.record(z.string(), z.string()),
  summary: z.unknown(),
  records: z.array(z.union([answeredSchema, failedSchema])),
});
