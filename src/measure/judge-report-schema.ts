import * as z from 'zod';

const recordSchema = z
  .object({
    case: z.string(),
    sample: z.number().int().min(1).max(3),
    verdict: z.enum(['allow', 'block', 'unreadable', 'failure']),
    rule: z.string().nullable(),
    failureReason: z.string().nullable(),
    elapsedMs: z.number().int(),
    outputTokens: z.number().int().nullable(),
    tail: z.string().nullable(),
  })
  .readonly();

export const judgeReportSchema = z
  .object({
    preset: z.string(),
    model: z.string(),
    samplesPerCase: z.literal(3),
    requestsSent: z.number().int(),
    policyHash: z.string(),
    corpusHash: z.string(),
    eligibleFrom: z.array(z.enum(['baseline', 'guidance'])).readonly(),
    records: z.array(recordSchema).readonly(),
  })
  .readonly();

export type JudgeReport = z.infer<typeof judgeReportSchema>;
