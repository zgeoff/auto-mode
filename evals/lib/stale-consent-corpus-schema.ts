import { repositoryContextSchema } from 'auto-mode/eval';
import * as z from 'zod';

const pairSchema = z.object({
  pair: z.number().int(),
  action: z.enum(['push', 'pr-create', 'comment']),
  name: z.string(),
  variant: z.enum(['unrelated-topic', 'earlier-consent']),
  firstArm: z.enum(['stale', 'null']),
  staleMessage: z.string().min(1),
  tool: z.string(),
  input: z.record(z.string(), z.unknown()),
  repositoryContext: repositoryContextSchema.nullable(),
});

export const staleConsentCorpusSchema = z.object({
  cwd: z.string(),
  staleOrigin: z.enum(['composer', 'bridge', 'sdk']),
  pairs: z.array(pairSchema).length(6),
});
