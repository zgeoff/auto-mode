import type { Config } from '../config/config.ts';
import { buildUnavailableVerdict } from '../policy/build-unavailable-verdict.ts';
import type { RepositoryContext } from '../types.ts';
import { collectDecisionContributors } from './collect-decision-contributors.ts';
import { DecisionRequestError } from './decision-request-error.ts';
import { findReviewedRule } from './find-reviewed-rule.ts';
import { formatClassifierNote } from './format-classifier-note.ts';
import { pickDecisionVerdict } from './pick-decision-verdict.ts';
import type {
  DecisionDiagnostics,
  DecisionRequest,
  DecisionResult,
  ModelOutcome,
} from './types.ts';

type JevAttempt =
  | {
      readonly kind: 'reply';
      readonly request: DecisionRequest;
      readonly result: DecisionResult;
      readonly repositoryContext: RepositoryContext | null;
    }
  | {
      readonly kind: 'failure';
      readonly error: unknown;
      readonly stage: DecisionDiagnostics['stage'];
      readonly cancelled: boolean;
      readonly deadlineExpired: boolean;
    };

interface JevAttemptFacts {
  readonly key: string | null;
  readonly keySource: DecisionDiagnostics['keySource'];
  readonly elapsedMs: number;
  readonly blockThreshold: number;
}

export function buildJevOutcome(
  attempt: JevAttempt,
  facts: Readonly<JevAttemptFacts>,
  config: Readonly<Pick<Config, 'provider' | 'onFailure'>>,
): ModelOutcome {
  const elapsedMs = Math.round(facts.elapsedMs);

  if (attempt.kind === 'reply') {
    const verdict = pickDecisionVerdict(attempt.request, attempt.result, facts.blockThreshold);
    const denied = findReviewedRule(attempt.request, attempt.result, facts.blockThreshold);

    return {
      verdict,
      ...(denied === null
        ? {}
        : { review: { ...denied, repositoryContext: attempt.repositoryContext } }),
      diagnostics: {
        status: verdict.kind,
        stage: 'response',
        keyResolved: true,
        keySource: facts.keySource,
        failureReason: null,
        requestBytes: attempt.result.requestBytes,
        elapsedMs,
        blockThreshold: facts.blockThreshold,
        contributors: collectDecisionContributors(
          attempt.request,
          attempt.result,
          facts.blockThreshold,
        ),
      },
      note: formatClassifierNote(
        `${config.provider.model}: ${verdict.kind} (${elapsedMs}ms, ${attempt.result.inputTokens} input tokens)`,
        facts.key,
      ),
    };
  }

  const failure = classifyFailure(attempt, config.provider.timeoutMs);

  const note = formatClassifierNote(
    `${config.provider.model} unavailable: ${failure.reason}`,
    facts.key,
  );

  return {
    verdict: buildUnavailableVerdict(config.onFailure, note),
    note,
    unavailable: true,
    diagnostics: {
      status: failure.status,
      stage: attempt.stage,
      keyResolved: facts.key !== null,
      keySource: facts.keySource,
      failureReason: attempt.error instanceof DecisionRequestError ? attempt.error.reason : null,
      requestBytes:
        attempt.error instanceof DecisionRequestError ? attempt.error.requestBytes : null,
      elapsedMs,
      blockThreshold: facts.blockThreshold,
      contributors: [],
    },
  };
}

function classifyFailure(
  attempt: Extract<JevAttempt, { kind: 'failure' }>,
  timeoutMs: number,
): { readonly reason: string; readonly status: DecisionDiagnostics['status'] } {
  if (attempt.cancelled) {
    return { reason: 'evaluation cancelled', status: 'cancelled' };
  }

  if (attempt.deadlineExpired) {
    return { reason: 'evaluation deadline expired', status: 'timeout' };
  }

  const error = attempt.error;

  if (!(error instanceof Error)) {
    return { reason: 'classifier failed', status: 'failure' };
  }

  const isTimeout =
    error.name === 'AbortError' ||
    (error instanceof DecisionRequestError && error.reason === 'aborted');

  return isTimeout
    ? { reason: `timed out after ${timeoutMs}ms`, status: 'timeout' }
    : { reason: error.message, status: 'failure' };
}
