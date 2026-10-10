import * as z from 'zod';
import { MESSAGE_ORIGINS } from '../../mods/auto-mode/contract/message-origins.ts';

const userTaskSchema = z.strictObject({
  text: z.string(),
  origin: z.enum(MESSAGE_ORIGINS),
});

const directUserMessageSchema = z.strictObject({
  ...userTaskSchema.shape,
  freshness: z.literal('stale').optional(),
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
  lastDirectUserMessage: directUserMessageSchema.nullable(),
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
