import { expect, test } from 'bun:test';
import type { HookPayload } from '../harness/types.ts';
import { buildUserMessage } from './build-request.ts';

const PAYLOAD: HookPayload = {
  harness: 'claude',
  event: 'PreToolUse',
  sessionId: 's-1',
  cwd: '/repo',
  toolName: 'Bash',
  toolInput: { command: 'git push --force origin main' },
  raw: {},
};

// The policy tells the classifier to judge the most recent action and to read
// everything before it as context, so the ordering is what makes that
// instruction resolvable.
test('it puts the transcript before the action', () => {
  const message = buildUserMessage(PAYLOAD, [{ role: 'user', text: 'clean up the repo' }], true);

  expect(message.indexOf('<transcript>')).toBeLessThan(message.indexOf('<action>'));
});

test('it labels the tool, the working directory and the input', () => {
  const message = buildUserMessage(PAYLOAD, [], true);

  expect(message).toInclude('tool: Bash');
  expect(message).toInclude('cwd: /repo');
  expect(message).toInclude('git push --force origin main');
});

test('it says so when the harness supplied no transcript', () => {
  const message = buildUserMessage(PAYLOAD, [], true);

  expect(message).toInclude('(no transcript available from this harness)');
});

test('it writes each transcript entry with its role', () => {
  const message = buildUserMessage(
    PAYLOAD,
    [
      { role: 'user', text: 'clean up the repo' },
      { role: 'assistant', text: 'running git clean' },
    ],
    true,
  );

  expect(message).toInclude('user: clean up the repo');
  expect(message).toInclude('assistant: running git clean');
});

// A reasoning model is told to think first. A non-reasoning one is told to
// answer with the tags alone, because its whole output is the answer and stray
// prose there breaks the parse.
test('it asks a reasoning model to work through the classification first', () => {
  expect(buildUserMessage(PAYLOAD, [], true)).toInclude('Work through the classification process');
});

test('it asks a non-reasoning model for the tags and nothing else', () => {
  expect(buildUserMessage(PAYLOAD, [], false)).toInclude('tags and nothing else');
});

// A tool input large enough to crowd out the policy is truncated rather than
// sent whole.
test('it truncates a tool input that is very large', () => {
  const message = buildUserMessage(
    { ...PAYLOAD, toolInput: { content: 'x'.repeat(20_000) } },
    [],
    true,
  );

  expect(message.length).toBeLessThan(10_000);
});
