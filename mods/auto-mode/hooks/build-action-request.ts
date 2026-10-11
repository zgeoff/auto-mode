import type { ModRequest, TaskOmission } from '../contract/types.ts';
import type { PromptContext } from './types.ts';

interface ActionRequestInput {
  readonly sessionID: string;
  readonly toolUseID: string | undefined;
  readonly cwd: string;
  readonly toolName: string;
  readonly toolInput: Readonly<Record<string, unknown>>;
  readonly agentID: string | null;
  readonly delegatedText: string | undefined;
  readonly prompts: PromptContext;
}

export function buildActionRequest(input: Readonly<ActionRequestInput>): ModRequest {
  const isChild = input.agentID !== null;

  const delegatedTask =
    input.delegatedText === undefined
      ? null
      : { text: input.delegatedText, origin: 'agent.spawn' as const };

  const omittedTaskContext: TaskOmission[] = [
    ...(input.prompts.originalUserTask === null
      ? [{ field: 'originalUserTask' as const, reason: 'unavailable' as const }]
      : []),
    ...(isChild && delegatedTask === null
      ? [{ field: 'delegatedTask' as const, reason: 'unavailable' as const }]
      : []),
  ];

  return {
    sessionID: input.sessionID,
    ...(input.toolUseID === undefined ? {} : { toolUseID: input.toolUseID }),
    cwd: input.cwd,
    toolName: input.toolName,
    toolInput: input.toolInput,
    context: {
      agentID: input.agentID,
      originalUserTask: input.prompts.originalUserTask,
      delegatedTask,
      lastDirectUserMessage: input.prompts.lastDirectUserMessage,
      omittedTaskContext,
    },
  };
}
