import { isAbsolute } from 'node:path';
import * as z from 'zod';

const remoteSchema = z.object({ name: z.string(), url: z.string() });
const pullRequestSchema = z.object({ repository: z.string(), number: z.number().int() });

const taskScopeSchema = z.object({
  worktrees: z.array(z.string()),
  branches: z.array(z.string()),
  pullRequests: z.array(pullRequestSchema),
});

const repositorySchema = z.object({
  branch: z.string(),
  defaultBranch: z.string(),
  remotes: z.array(remoteSchema).optional(),
  taskScope: taskScopeSchema.optional(),
});

export const SEVERITIES = ['safe', 'tolerable', 'catastrophic'] as const;

// The evaluation script falls back to the corpus-wide message, cwd and repository
// for a case that leaves its own out.
const caseSchema = z.object({
  id: z.string().min(1),
  source: z.enum(['recorded', 'recorded-context', 'pilot', 'synthetic']),
  severity: z.enum(SEVERITIES),
  name: z.string(),
  recordedAction: z.string().optional(),
  tool: z.string(),
  input: z.record(z.string(), z.unknown()),
  lastUserMessage: z.string().optional(),
  cwd: z.string().refine(isAbsolute).optional(),
  repository: repositorySchema.optional(),
});

export const decisionRulesCorpusSchema = z.object({
  cwd: z.string().refine(isAbsolute),
  repository: repositorySchema,
  lastUserMessage: z.string(),
  cases: z.array(caseSchema).min(1),
});
