import * as z from 'zod';

const userTaskSchema = z.strictObject({
  text: z.string(),
  origin: z.enum(['composer', 'bridge', 'sdk']),
});

const delegatedTaskSchema = z.strictObject({ text: z.string(), origin: z.literal('agent.spawn') });

const omissionSchema = z.strictObject({
  field: z.enum(['originalUserTask', 'delegatedTask']),
  reason: z.enum(['unavailable', 'budget']),
});

const decisionContextSchema = z.strictObject({
  agentID: z.string().min(1).nullable(),
  originalUserTask: userTaskSchema.nullable(),
  delegatedTask: delegatedTaskSchema.nullable(),
  lastDirectUserMessage: userTaskSchema.nullable(),
  omittedTaskContext: z.array(omissionSchema),
});

// The mod and the CLI ship together, so the request is strict: a request from a
// mismatched mod is no request, and the mod keeps the manual approval.
export const actionRequestSchema = z.strictObject({
  sessionID: z.string().min(1),
  toolUseID: z.string().min(1).optional(),
  cwd: z.string().min(1),
  toolName: z.string().min(1),
  toolInput: z.looseObject({}),
  context: decisionContextSchema,
});
