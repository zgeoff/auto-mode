import { expect, test } from 'bun:test';
import { buildMockConfig } from '../../test-utils/factories/build-mock-config.ts';
import { buildMockDecisionAnswer } from '../../test-utils/factories/build-mock-decision-answer.ts';
import { buildMockDecisionRequest } from '../../test-utils/factories/build-mock-decision-request.ts';
import { buildMockDecisionResult } from '../../test-utils/factories/build-mock-decision-result.ts';
import { buildMockDecisionRule } from '../../test-utils/factories/build-mock-decision-rule.ts';
import { buildMockRepositoryContext } from '../../test-utils/factories/build-mock-repository-context.ts';
import { buildJevOutcome } from './build-jev-outcome.ts';
import { DecisionRequestError } from './decision-request-error.ts';

test('it allows a reply below the block threshold and reports the response diagnostics', () => {
  const outcome = buildJevOutcome(
    {
      kind: 'reply',
      request: buildMockDecisionRequest({
        rules: {
          rule_0: buildMockDecisionRule({
            name: 'History Rewrite',
            tier: 'soft',
            source: 'shipped',
          }),
        },
      }),
      result: buildMockDecisionResult({
        answers: {
          rule_0: buildMockDecisionAnswer({
            choice: 'allow',
            confidence: 0.9,
            probabilities: { allow: 0.9, block: 0.1 },
          }),
        },
        inputTokens: 400,
        requestBytes: 2048,
      }),
      repositoryContext: null,
    },
    { key: 'test-key', keySource: 'environment', elapsedMs: 41.6, blockThreshold: 0.2 },
    buildMockConfig({ provider: { model: 'jev-1.13.0' }, onFailure: 'defer' }),
  );

  expect(outcome).toStrictEqual({
    verdict: { kind: 'allow' },
    diagnostics: {
      status: 'allow',
      stage: 'response',
      keyResolved: true,
      keySource: 'environment',
      failureReason: null,
      requestBytes: 2048,
      elapsedMs: 42,
      blockThreshold: 0.2,
      contributors: [],
    },
    note: 'jev-1.13.0: allow (42ms, 400 input tokens)',
  });
});

test('it denies a reply at the block threshold and hands the judge the rule with the repository context', () => {
  const rule = buildMockDecisionRule({ name: 'History Rewrite', tier: 'soft', source: 'shipped' });
  const repositoryContext = buildMockRepositoryContext();

  const outcome = buildJevOutcome(
    {
      kind: 'reply',
      request: buildMockDecisionRequest({ rules: { rule_0: rule } }),
      result: buildMockDecisionResult({
        answers: {
          rule_0: buildMockDecisionAnswer({
            choice: 'block',
            confidence: 0.8,
            probabilities: { allow: 0.2, block: 0.8 },
          }),
        },
        inputTokens: 400,
        requestBytes: 2048,
      }),
      repositoryContext,
    },
    { key: 'test-key', keySource: 'command', elapsedMs: 12, blockThreshold: 0.2 },
    buildMockConfig({ provider: { model: 'jev-1.13.0' }, onFailure: 'defer' }),
  );

  expect(outcome).toStrictEqual({
    verdict: {
      kind: 'deny',
      rule: 'History Rewrite',
      reason:
        'The action matches this rule: rewriting history on the default branch, a protected branch, or a branch outside the task scope. A direct user instruction that names the force push, the rewrite, or the remote branch clears it.',
    },
    review: { rule, basis: 'matched', repositoryContext },
    diagnostics: {
      status: 'deny',
      stage: 'response',
      keyResolved: true,
      keySource: 'command',
      failureReason: null,
      requestBytes: 2048,
      elapsedMs: 12,
      blockThreshold: 0.2,
      contributors: [
        {
          rule: 'History Rewrite',
          source: 'shipped',
          tier: 'soft',
          choice: 'block',
          confidence: 0.8,
          blockProbability: 0.8,
        },
      ],
    },
    note: 'jev-1.13.0: deny (12ms, 400 input tokens)',
  });
});

test('it reports a missing key as a failure at the credential stage', () => {
  expect(
    buildJevOutcome(
      {
        kind: 'failure',
        error: new Error('no API key: set the configured environment variable or key command'),
        stage: 'credential',
        cancelled: false,
        deadlineExpired: false,
      },
      { key: null, keySource: 'none', elapsedMs: 3, blockThreshold: 0.2 },
      buildMockConfig({ provider: { model: 'jev-1.13.0' }, onFailure: 'defer' }),
    ),
  ).toStrictEqual({
    verdict: null,
    note: 'jev-1.13.0 unavailable: no API key: set the configured environment variable or key command',
    unavailable: true,
    diagnostics: {
      status: 'failure',
      stage: 'credential',
      keyResolved: false,
      keySource: 'none',
      failureReason: null,
      requestBytes: null,
      elapsedMs: 3,
      blockThreshold: 0.2,
      contributors: [],
    },
  });
});

test('it defers an oversized request and records only the failure reason', () => {
  expect(
    buildJevOutcome(
      {
        kind: 'failure',
        error: new DecisionRequestError(
          'request-too-large',
          100_412,
          'Decision input exceeds 100000 bytes; refusing to truncate the action or user message',
        ),
        stage: 'request',
        cancelled: false,
        deadlineExpired: false,
      },
      { key: 'test-key', keySource: 'environment', elapsedMs: 5, blockThreshold: 0.2 },
      buildMockConfig({ provider: { model: 'jev-1.13.0' }, onFailure: 'defer' }),
    ),
  ).toStrictEqual({
    verdict: null,
    note: 'jev-1.13.0 unavailable: Decision input exceeds 100000 bytes; refusing to truncate the action or user message',
    unavailable: true,
    diagnostics: {
      status: 'failure',
      stage: 'request',
      keyResolved: true,
      keySource: 'environment',
      failureReason: 'request-too-large',
      requestBytes: 100_412,
      elapsedMs: 5,
      blockThreshold: 0.2,
      contributors: [],
    },
  });
});

test('it reports an aborted provider request as a timeout with the request size', () => {
  expect(
    buildJevOutcome(
      {
        kind: 'failure',
        error: new DecisionRequestError('aborted', 2048, 'Decision request aborted'),
        stage: 'request',
        cancelled: false,
        deadlineExpired: false,
      },
      { key: 'test-key', keySource: 'environment', elapsedMs: 21, blockThreshold: 0.2 },
      buildMockConfig({
        provider: { model: 'jev-1.13.0', timeoutMs: 20 },
        onFailure: 'defer',
      }),
    ),
  ).toStrictEqual({
    verdict: null,
    note: 'jev-1.13.0 unavailable: timed out after 20ms',
    unavailable: true,
    diagnostics: {
      status: 'timeout',
      stage: 'request',
      keyResolved: true,
      keySource: 'environment',
      failureReason: 'aborted',
      requestBytes: 2048,
      elapsedMs: 21,
      blockThreshold: 0.2,
      contributors: [],
    },
  });
});

test('it reports an AbortError as a timeout that names the fractional provider timeout', () => {
  expect(
    buildJevOutcome(
      {
        kind: 'failure',
        error: new DOMException('The operation was aborted', 'AbortError'),
        stage: 'request',
        cancelled: false,
        deadlineExpired: false,
      },
      { key: 'test-key', keySource: 'environment', elapsedMs: 1001, blockThreshold: 0.2 },
      buildMockConfig({
        provider: { model: 'jev-1.13.0', timeoutMs: 1000.5 },
        onFailure: 'defer',
      }),
    ),
  ).toStrictEqual({
    verdict: null,
    note: 'jev-1.13.0 unavailable: timed out after 1000.5ms',
    unavailable: true,
    diagnostics: {
      status: 'timeout',
      stage: 'request',
      keyResolved: true,
      keySource: 'environment',
      failureReason: null,
      requestBytes: null,
      elapsedMs: 1001,
      blockThreshold: 0.2,
      contributors: [],
    },
  });
});

test('it returns the configured denial when the evaluation deadline expired', () => {
  expect(
    buildJevOutcome(
      {
        kind: 'failure',
        error: new DecisionRequestError('aborted', 2048, 'Decision request aborted'),
        stage: 'request',
        cancelled: false,
        deadlineExpired: true,
      },
      { key: 'test-key', keySource: 'command', elapsedMs: 7, blockThreshold: 0.2 },
      buildMockConfig({ provider: { model: 'jev-1.13.0' }, onFailure: 'deny' }),
    ),
  ).toStrictEqual({
    verdict: {
      kind: 'deny',
      rule: 'Classifier Unavailable',
      reason: 'jev-1.13.0 unavailable: evaluation deadline expired',
    },
    note: 'jev-1.13.0 unavailable: evaluation deadline expired',
    unavailable: true,
    diagnostics: {
      status: 'timeout',
      stage: 'request',
      keyResolved: true,
      keySource: 'command',
      failureReason: 'aborted',
      requestBytes: 2048,
      elapsedMs: 7,
      blockThreshold: 0.2,
      contributors: [],
    },
  });
});

test('it reports a caller cancellation as cancelled even after the deadline expired', () => {
  expect(
    buildJevOutcome(
      {
        kind: 'failure',
        error: new DecisionRequestError('aborted', 2048, 'Decision request aborted'),
        stage: 'request',
        cancelled: true,
        deadlineExpired: true,
      },
      { key: 'test-key', keySource: 'environment', elapsedMs: 9, blockThreshold: 0.2 },
      buildMockConfig({ provider: { model: 'jev-1.13.0' }, onFailure: 'deny' }),
    ),
  ).toStrictEqual({
    verdict: {
      kind: 'deny',
      rule: 'Classifier Unavailable',
      reason: 'jev-1.13.0 unavailable: evaluation cancelled',
    },
    note: 'jev-1.13.0 unavailable: evaluation cancelled',
    unavailable: true,
    diagnostics: {
      status: 'cancelled',
      stage: 'request',
      keyResolved: true,
      keySource: 'environment',
      failureReason: 'aborted',
      requestBytes: 2048,
      elapsedMs: 9,
      blockThreshold: 0.2,
      contributors: [],
    },
  });
});

test('it reports a thrown value that is not an Error as a classifier failure', () => {
  expect(
    buildJevOutcome(
      {
        kind: 'failure',
        error: 'offline',
        stage: 'evidence',
        cancelled: false,
        deadlineExpired: false,
      },
      { key: 'test-key', keySource: 'environment', elapsedMs: 2, blockThreshold: 0.2 },
      buildMockConfig({ provider: { model: 'jev-1.13.0' }, onFailure: 'defer' }),
    ),
  ).toStrictEqual({
    verdict: null,
    note: 'jev-1.13.0 unavailable: classifier failed',
    unavailable: true,
    diagnostics: {
      status: 'failure',
      stage: 'evidence',
      keyResolved: true,
      keySource: 'environment',
      failureReason: null,
      requestBytes: null,
      elapsedMs: 2,
      blockThreshold: 0.2,
      contributors: [],
    },
  });
});

test('it redacts the key from a failure message', () => {
  const outcome = buildJevOutcome(
    {
      kind: 'failure',
      error: new Error('rejected key sk-test-4471'),
      stage: 'request',
      cancelled: false,
      deadlineExpired: false,
    },
    { key: 'sk-test-4471', keySource: 'command', elapsedMs: 4, blockThreshold: 0.2 },
    buildMockConfig({ provider: { model: 'jev-1.13.0' }, onFailure: 'deny' }),
  );

  expect(outcome.note).toBe('jev-1.13.0 unavailable: rejected key [redacted]');

  expect(outcome.verdict).toStrictEqual({
    kind: 'deny',
    rule: 'Classifier Unavailable',
    reason: 'jev-1.13.0 unavailable: rejected key [redacted]',
  });
});
