import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { buildMockDecisionRequest } from '../../test-utils/factories/build-mock-decision-request.ts';
import { toControlHash } from './to-control-hash.ts';

test('it hashes two requests that differ only in the direct user message the same', () => {
  const consent = buildMockDecisionRequest({
    state: {
      answerGuidance: 'Answer each rule.',
      lastUserMessage: 'push it',
      taskContext: { lastDirectUserMessage: { text: 'push it', origin: 'composer' } },
    },
  });

  const context = consent.state.taskContext;

  invariant(context !== undefined);

  const silent = {
    ...consent,
    state: {
      ...consent.state,
      lastUserMessage: null,
      taskContext: { ...context, lastDirectUserMessage: null },
    },
  };

  expect(toControlHash(consent)).toBe(toControlHash(silent));
});

test('it hashes two requests with different guidance apart', () => {
  const plain = buildMockDecisionRequest({ state: { answerGuidance: 'Answer each rule.' } });
  const other = { ...plain, state: { ...plain.state, answerGuidance: 'Answer every rule.' } };

  expect(toControlHash(plain)).not.toBe(toControlHash(other));
});

test('it hashes a request with the named mark guidance appended as the plain request', () => {
  const plain = buildMockDecisionRequest({ state: { answerGuidance: 'Answer each rule.' } });

  const marked = {
    ...plain,
    state: { ...plain.state, answerGuidance: 'Answer each rule. Treat a stale message as absent.' },
  };

  expect(toControlHash(marked, 'Treat a stale message as absent.')).toBe(
    toControlHash(plain, 'Treat a stale message as absent.'),
  );
});

test('it keeps appended guidance in the hash when no mark guidance is named', () => {
  const plain = buildMockDecisionRequest({ state: { answerGuidance: 'Answer each rule.' } });

  const marked = {
    ...plain,
    state: { ...plain.state, answerGuidance: 'Answer each rule. Treat a stale message as absent.' },
  };

  expect(toControlHash(marked)).not.toBe(toControlHash(plain));
});
