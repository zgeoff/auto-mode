import * as z from 'zod';

const caseSchema = z.object({
  pair: z.number().int(),
  name: z.string(),
  kind: z.enum(['safe', 'risk']),
  tool: z.string(),
  input: z.record(z.string(), z.unknown()),
});

export const answerGuidanceCorpusSchema = z.object({
  lastUserMessage: z.string(),
  cases: z.array(caseSchema).length(12),
});
