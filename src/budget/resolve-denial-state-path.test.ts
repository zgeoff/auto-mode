import { expect, test } from 'bun:test';
import { buildMockActionRequest } from '../../test-utils/factories/build-mock-action-request.ts';
import { resolveDenialStatePath } from './resolve-denial-state-path.ts';

test('it places the session file under the denials directory of the state directory', () => {
  const path = resolveDenialStatePath(
    buildMockActionRequest({ sessionID: 'session-1', decisionContext: { agentID: null } }),
    '/state/auto-mode',
  );

  expect(path).toMatch(/^\/state\/auto-mode\/denials\/[0-9a-f]{32}\.json$/u);
});

test('it keeps one file for every action of a session', () => {
  const first = buildMockActionRequest({
    sessionID: 'session-1',
    toolInput: { command: 'git push a' },
    decisionContext: { agentID: null },
  });

  const second = buildMockActionRequest({
    sessionID: 'session-1',
    toolInput: { command: 'git push b' },
    decisionContext: { agentID: null },
  });

  expect(resolveDenialStatePath(second, '/state')).toBe(resolveDenialStatePath(first, '/state'));
});

test('it keeps a subagent apart from its session', () => {
  const main = buildMockActionRequest({
    sessionID: 'session-1',
    decisionContext: { agentID: null },
  });

  const child = buildMockActionRequest({
    sessionID: 'session-1',
    decisionContext: { agentID: 'subagent' },
  });

  expect(resolveDenialStatePath(child, '/state')).not.toBe(resolveDenialStatePath(main, '/state'));
});

test('it keeps another session apart', () => {
  const one = buildMockActionRequest({
    sessionID: 'session-1',
    decisionContext: { agentID: null },
  });

  const two = buildMockActionRequest({
    sessionID: 'session-2',
    decisionContext: { agentID: null },
  });

  expect(resolveDenialStatePath(two, '/state')).not.toBe(resolveDenialStatePath(one, '/state'));
});
