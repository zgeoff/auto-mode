import { sendDecision } from 'auto-mode';
import type { DecisionRequest, DecisionResult, ProviderConfig } from 'auto-mode';
import { toTimerDelay } from 'auto-mode/eval';

interface SendOptions {
  // oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- fetch's own signature takes a mutable RequestInit
  readonly fetch?: (url: string, init: Readonly<RequestInit>) => Promise<Response>;
}

export function sendEvaluationDecision(
  provider: Readonly<ProviderConfig>,
  key: string,
  request: Readonly<DecisionRequest>,
  options?: SendOptions,
): Promise<DecisionResult> {
  return sendDecision(
    provider,
    key,
    request,
    AbortSignal.timeout(toTimerDelay(provider.timeoutMs)),
    options,
  );
}
