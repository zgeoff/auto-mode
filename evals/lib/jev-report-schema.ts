import * as z from 'zod';

const probability = z.number().min(0).max(1);

const contributorSchema = z
  .object({
    rule: z.string(),
    tier: z.enum(['hard', 'soft']),
    choice: z.enum(['allow', 'block', 'ask']),
    confidence: probability,
    allow: probability,
    block: probability,
    ask: probability,
  })
  .readonly();

const recordSchema = z
  .object({
    case: z.string(),
    sample: z.number().int().min(1).max(3),
    status: z.enum(['allow', 'ask', 'deny', 'failure']),
    failureReason: z.string().nullable(),
    rule: z.string().nullable(),
    ruleCount: z.number().int(),
    contributors: z.array(contributorSchema).readonly(),
    elapsedMs: z.number().int(),
    requestBytes: z.number().int(),
  })
  .readonly();

export const jevReportSchema = z
  .object({
    variant: z.enum(['baseline', 'guidance']),
    model: z.string(),
    threshold: z.literal(0.8),
    samplesPerCase: z.literal(3),
    requestsSent: z.number().int(),
    policyHash: z.string(),
    guidanceHash: z.string().nullable(),
    configuredRulesHash: z.string(),
    corpusHash: z.string(),
    records: z.array(recordSchema).readonly(),
  })
  .readonly();

export type JevReport = z.infer<typeof jevReportSchema>;
