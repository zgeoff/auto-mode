import { expect, test } from 'bun:test';
import { buildStubScopeEventVerifier } from './build-stub-scope-event-verifier.ts';
import { buildMockScopeRecordRequest } from './factories/build-mock-scope-record-request.ts';
import { buildMockSessionScope } from './factories/build-mock-session-scope.ts';

test('it confirms the scope given for any claimed event', () => {
  const verifier = buildStubScopeEventVerifier({
    confirms: buildMockSessionScope({ worktrees: ['/w/app-fix'], branches: [], pullRequests: [] }),
  });

  expect(
    verifier.verifyEvent(
      { kind: 'branch', name: 'fix/a', directory: '/w/app' },
      buildMockScopeRecordRequest({ command: 'git branch fix/a' }),
    ),
  ).resolves.toStrictEqual({ worktrees: ['/w/app-fix'], branches: [], pullRequests: [] });
});

test('it fails the check of any claimed event with the message given', () => {
  const verifier = buildStubScopeEventVerifier({ fails: 'the checkout is gone' });

  expect(
    verifier.verifyEvent(
      { kind: 'worktree', path: '/w/app-fix' },
      buildMockScopeRecordRequest({ command: 'git worktree add ../app-fix' }),
    ),
  ).rejects.toThrowWithMessage(Error, 'the checkout is gone');
});
