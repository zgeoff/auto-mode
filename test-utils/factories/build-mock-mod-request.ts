import type * as z from 'zod';
import type { actionRequestSchema } from '../../src/request/action-request-schema.ts';
import { buildMockActionRequest } from './build-mock-action-request.ts';
import { buildMockDecisionContext } from './build-mock-decision-context.ts';

type ModRequestOverrides = Omit<
  NonNullable<Parameters<typeof buildMockActionRequest>[0]>,
  'decisionContext'
> & {
  readonly context?: Parameters<typeof buildMockDecisionContext>[0];
};

// The body the mod writes to the CLI's stdin: an action request whose task
// context sits under `context`.
export function buildMockModRequest(
  overrides: ModRequestOverrides = {},
): z.input<typeof actionRequestSchema> {
  const { context, ...rest } = overrides;
  const request = buildMockActionRequest(rest);
  const decisionContext = buildMockDecisionContext(context);

  return {
    sessionID: request.sessionID,
    toolUseID: request.toolUseID,
    cwd: request.cwd,
    toolName: request.toolName,
    toolInput: request.toolInput,
    context: {
      ...decisionContext,
      omittedTaskContext: [...decisionContext.omittedTaskContext],
    },
  };
}
