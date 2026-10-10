import * as z from 'zod';
import { caseLabelSchema } from './case-labels-schema.ts';

export const sampleRecordSchema = z
  .strictObject({
    caseKey: z.string().min(1),
    labels: caseLabelSchema,
    sample: z.number().int().nonnegative(),
    stage: z.string().min(1),
    status: z.enum(['scored', 'not-scorable', 'skipped']),
    verdict: z.enum(['allow', 'deny']).nullable(),
    pBlock: z.number().min(0).max(1).nullable(),
    reason: z.string().nullable(),
    latencyMs: z.number().nonnegative().nullable(),
    requestHash: z.string().nullable(),
    answerHash: z.string().nullable(),
  })
  .readonly();

export type SampleRecord = z.output<typeof sampleRecordSchema>;
