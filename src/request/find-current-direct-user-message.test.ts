import { expect, test } from 'bun:test';
import { buildMockDecisionContext } from '../../test-utils/factories/build-mock-decision-context.ts';
import { findCurrentDirectUserMessage } from './find-current-direct-user-message.ts';

test('it returns the text of a current direct message to the main agent', () => {
  const context = buildMockDecisionContext({
    agentID: null,
    lastDirectUserMessage: { text: 'Push it to main', origin: 'composer' },
  });

  expect(findCurrentDirectUserMessage(context)).toBe('Push it to main');
});

test('it returns nothing for a direct message marked stale', () => {
  const context = buildMockDecisionContext({
    agentID: null,
    lastDirectUserMessage: { text: 'Push it to main', origin: 'composer', freshness: 'stale' },
  });

  expect(findCurrentDirectUserMessage(context)).toBeNull();
});

test('it returns nothing to a child agent', () => {
  const context = buildMockDecisionContext({
    agentID: 'agent-1',
    lastDirectUserMessage: { text: 'Push it to main', origin: 'composer' },
  });

  expect(findCurrentDirectUserMessage(context)).toBeNull();
});

test('it returns nothing when no direct message was sent', () => {
  const context = buildMockDecisionContext({ agentID: null, lastDirectUserMessage: null });

  expect(findCurrentDirectUserMessage(context)).toBeNull();
});

test('it returns nothing when the request carries no decision context', () => {
  expect(findCurrentDirectUserMessage(undefined)).toBeNull();
});
