import * as z from 'zod';

const caseEntrySchema = z.strictObject({ case: z.string() }).readonly();

const callEntrySchema = z
  .strictObject({
    cwd: z.string(),
    command: z.string(),
    succeeded: z.boolean(),
    resultText: z.string(),
  })
  .readonly();

const sessionSchema = z
  .object({
    name: z.string(),
    entries: z.array(z.union([caseEntrySchema, callEntrySchema])).readonly(),
  })
  .readonly();

const remoteSchema = z.object({ name: z.string(), url: z.string() }).readonly();

export const taskScopeSessionsSchema = z
  .object({
    home: z.string(),
    remotes: z.array(remoteSchema).readonly(),
    worktreeBranches: z.record(z.string(), z.string()).readonly(),
    pullRequestHeads: z.record(z.string(), z.string()).readonly(),
    atc: z.record(z.string(), z.unknown()).readonly(),
    sessions: z.array(sessionSchema).readonly(),
  })
  .readonly();

export type TaskScopeSessions = z.infer<typeof taskScopeSessionsSchema>;
