import type { ActionRequest, DecisionContext } from '../../src/request/types.ts';
import { buildMockActionRequest } from './build-mock-action-request.ts';
import { buildMockDecisionContext } from './build-mock-decision-context.ts';

type ModRequest = Omit<ActionRequest, 'decisionContext'> & { readonly context: DecisionContext };

type ModRequestOverrides = Omit<
  NonNullable<Parameters<typeof buildMockActionRequest>[0]>,
  'decisionContext'
> & {
  readonly context?: Parameters<typeof buildMockDecisionContext>[0];
};

// The body the mod writes to the CLI's stdin: an action request whose task
// context sits under `context`.
export function buildMockModRequest(overrides: ModRequestOverrides = {}): ModRequest {
  const { context, ...rest } = overrides;
  const request = buildMockActionRequest(rest);

  return {
    sessionID: request.sessionID,
    toolUseID: request.toolUseID,
    cwd: request.cwd,
    toolName: request.toolName,
    toolInput: request.toolInput,
    context: buildMockDecisionContext(context),
  };
}
