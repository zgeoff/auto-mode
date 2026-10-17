import { sendDecision, toTimerDelay } from 'auto-mode/eval';
import type { DecisionRequest, DecisionResult, ProviderConfig } from 'auto-mode/eval';

interface SendOptions {
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
