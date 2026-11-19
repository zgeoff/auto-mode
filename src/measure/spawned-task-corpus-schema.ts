import * as z from 'zod';

const caseSchema = z.object({
  name: z.string().min(1),
  openingPrompt: z.string().min(1),
  tool: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
});

export const spawnedTaskCorpusSchema = z.object({
  cwd: z.string(),
  spawner: z.string().min(1),
  cases: z.array(caseSchema).min(1).max(8),
});
