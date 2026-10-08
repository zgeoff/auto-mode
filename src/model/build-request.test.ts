import { expect, test } from 'bun:test';
import { buildMockActionRequest } from '../../test-utils/factories/build-mock-action-request.ts';
import { buildMockRepositoryContext } from '../../test-utils/factories/build-mock-repository-context.ts';
import { buildUserMessage } from './build-request.ts';

// The policy tells the classifier to judge the most recent action and to read
// everything before it as context, so the transcript, then the repository
// facts, then the action is what makes that instruction resolvable.
test('it renders the transcript, the repository facts and the action in that order', () => {
  const message = buildUserMessage(
    {
      sessionID: 'session-1',
      toolUseID: 'toolu_never_sent',
      cwd: '/work/app',
      toolName: 'Bash',
      toolInput: { command: 'git push --force origin main' },
    },
    [
      { role: 'user', text: 'clean up the repo' },
      { role: 'assistant', text: 'running git clean' },
    ],
    true,
    {
      cwd: '/work/app',
      branch: 'feature',
      defaultBranch: 'main',
      remotes: [{ name: 'origin', url: 'github.com:dev/app.git' }],
    },
  );

  expect(message).toMatchInlineSnapshot(`
    "<transcript>
    user: clean up the repo

    assistant: running git clean
    </transcript>

    <repository>
    {
      "cwd": "/work/app",
      "branch": "feature",
      "defaultBranch": "main",
      "remotes": [
        {
          "name": "origin",
          "url": "github.com:dev/app.git"
        }
      ]
    }
    </repository>

    <action>
    tool: Bash
    cwd: /work/app
    input:
    {
      "command": "git push --force origin main"
    }
    </action>

    Work through the classification process, then end your reply with the output contract tags."
  `);
});

test('it renders the same message from the same input', () => {
  const payload = buildMockActionRequest();
  const transcript = [{ role: 'user', text: 'clean up the repo' }];
  const repositoryContext = buildMockRepositoryContext();

  expect(buildUserMessage(payload, transcript, true, repositoryContext)).toBe(
    buildUserMessage(payload, transcript, true, repositoryContext),
  );
});

test('it marks the transcript unavailable when there is none', () => {
  const message = buildUserMessage(
    buildMockActionRequest({ cwd: '/repo', toolName: 'Bash', toolInput: { command: 'ls' } }),
    [],
    true,
  );

  expect(message).toBe(
    '<transcript>\n(no transcript available from this harness)\n</transcript>\n\n<action>\ntool: Bash\ncwd: /repo\ninput:\n{\n  "command": "ls"\n}\n</action>\n\nWork through the classification process, then end your reply with the output contract tags.',
  );
});

// A non-reasoning model's whole output is the answer, and stray prose there
// breaks the parse.
test('it asks a non-reasoning model for the tags and nothing else', () => {
  const message = buildUserMessage(
    buildMockActionRequest({ cwd: '/repo', toolName: 'Bash', toolInput: { command: 'ls' } }),
    [{ role: 'user', text: 'list the files' }],
    false,
  );

  expect(message).toBe(
    '<transcript>\nuser: list the files\n</transcript>\n\n<action>\ntool: Bash\ncwd: /repo\ninput:\n{\n  "command": "ls"\n}\n</action>\n\nReply with the output contract tags and nothing else.',
  );
});

// A tool input large enough to crowd out the policy is cut to its first 4000
// characters rather than sent whole.
test('it truncates a very large tool input to its first 4000 characters', () => {
  const message = buildUserMessage(
    buildMockActionRequest({
      cwd: '/repo',
      toolName: 'Write',
      toolInput: { content: 'x'.repeat(20_000) },
    }),
    [],
    false,
  );

  expect(message).toBe(
    `<transcript>\n(no transcript available from this harness)\n</transcript>\n\n<action>\ntool: Write\ncwd: /repo\ninput:\n{\n  "content": "${'x'.repeat(4000 - '{\n  "content": "'.length)}\n</action>\n\nReply with the output contract tags and nothing else.`,
  );
});
