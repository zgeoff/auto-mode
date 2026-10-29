import type { Runtime } from '../config/types.ts';
import type { ActionRequest, DecisionContext } from '../request/types.ts';
import { probeLauncherSpawner } from './probe-launcher-spawner.ts';

// A launcher passes a spawned session's opening prompt on the command line, and
// Claude Code reports it with the origin of a typed prompt.
export async function resolveOpeningPrompt(
  request: ActionRequest,
  runtime: Readonly<Pick<Runtime, 'host' | 'readTextFile'>>,
): Promise<ActionRequest> {
  const context = request.decisionContext;
  const task = context?.originalUserTask ?? null;
  const message = context?.lastDirectUserMessage ?? null;
  const opening = task?.position === 'opening' ? task : message;

  if (context === undefined || opening?.position !== 'opening') {
    return request;
  }

  const isSpawned = await probeLauncherSpawner(
    runtime.host.env['AUTO_MODE_SCOPE_FILE'],
    runtime.readTextFile,
  );

  return {
    ...request,
    decisionContext: isSpawned
      ? buildSpawnedContext(context, opening.text)
      : {
          ...context,
          originalUserTask: task === null ? null : toUnmarked(task),
          lastDirectUserMessage: message === null ? null : toUnmarked(message),
        },
  };
}

function buildSpawnedContext(context: DecisionContext, openingText: string): DecisionContext {
  const isTaskOpening = context.originalUserTask?.position === 'opening';
  const message = context.lastDirectUserMessage;

  const isOmitted = context.omittedTaskContext.some(
    (omission) => omission.field === 'originalUserTask',
  );

  return {
    ...context,
    originalUserTask: isTaskOpening ? null : context.originalUserTask,
    delegatedTask: context.delegatedTask ?? { text: openingText, origin: 'agent.spawn' },
    lastDirectUserMessage: message?.position === 'opening' ? null : message,
    omittedTaskContext:
      isTaskOpening && !isOmitted
        ? [...context.omittedTaskContext, { field: 'originalUserTask', reason: 'unavailable' }]
        : context.omittedTaskContext,
  };
}

function toUnmarked<T extends { readonly position?: 'opening' | undefined }>(
  value: T,
): Omit<T, 'position'> {
  const { position: _, ...unmarked } = value;

  return unmarked;
}
