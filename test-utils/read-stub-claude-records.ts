import { readFile } from 'node:fs/promises';
import * as z from 'zod';

const stubClaudeRecordSchema = z.object({
  pid: z.number(),
  review: z.number(),
  clears: z.number(),
  cwd: z.string(),
  argv: z.array(z.string()),
  system: z.unknown(),
  user: z.string(),
  env: z.record(z.string(), z.string().optional()),
});

export type StubClaudeRecord = z.infer<typeof stubClaudeRecordSchema>;

export async function readStubClaudeRecords(recordPath: string): Promise<StubClaudeRecord[]> {
  const recorded = await readFile(recordPath, 'utf8');

  return recorded
    .trim()
    .split('\n')
    .map((line) => stubClaudeRecordSchema.parse(JSON.parse(line)));
}
