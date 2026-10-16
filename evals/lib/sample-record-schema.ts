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

    // The model that wrote the answer; a record from before the field has none.
    model: z.string().min(1).nullable().optional(),

    // Whether a judge reply came from a safety fallback; null for an answer the
    // transport reports no fallback evidence for.
    fallback: z.boolean().nullable().optional(),
  })
  .readonly();

export type SampleRecord = z.output<typeof sampleRecordSchema>;
