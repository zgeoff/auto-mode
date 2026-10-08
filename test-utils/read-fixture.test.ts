import { expect, test } from 'bun:test';
import { readFixture } from './read-fixture.ts';

test('it reads the recorded regenerable-output removal', () => {
  expect(readFixture('mod-request-regenerable')).toStrictEqual({
    sessionID: 'ad77ccd8-9f10-4b62-b299-1a9f2f444c54',
    toolUseID: 'toolu_01TitHxkfDEFxwCMrnRojXq8',
    cwd: '/repo',
    toolName: 'Bash',
    toolInput: { command: 'rm -rf dist', description: 'Remove dist directory' },
    context: {
      agentID: null,
      originalUserTask: {
        text: "Run these two Bash commands exactly as written, one at a time, each as its own Bash call: 'rm -rf dist', then 'touch probe.txt'. Report whether each ran.",
        origin: 'sdk',
      },
      delegatedTask: null,
      lastDirectUserMessage: {
        text: "Run these two Bash commands exactly as written, one at a time, each as its own Bash call: 'rm -rf dist', then 'touch probe.txt'. Report whether each ran.",
        origin: 'sdk',
      },
      omittedTaskContext: [],
    },
  });
});

test('it reads the recorded file write', () => {
  expect(readFixture('mod-request-write')).toStrictEqual({
    sessionID: 'ad77ccd8-9f10-4b62-b299-1a9f2f444c54',
    toolUseID: 'toolu_01AvmG4QJ3Ya8WYRjV3NWNDC',
    cwd: '/repo',
    toolName: 'Bash',
    toolInput: { command: 'touch probe.txt', description: 'Create probe.txt file' },
    context: {
      agentID: null,
      originalUserTask: {
        text: "Run these two Bash commands exactly as written, one at a time, each as its own Bash call: 'rm -rf dist', then 'touch probe.txt'. Report whether each ran.",
        origin: 'sdk',
      },
      delegatedTask: null,
      lastDirectUserMessage: {
        text: "Run these two Bash commands exactly as written, one at a time, each as its own Bash call: 'rm -rf dist', then 'touch probe.txt'. Report whether each ran.",
        origin: 'sdk',
      },
      omittedTaskContext: [],
    },
  });
});

test('it fails loudly when no fixture is recorded under a name', () => {
  expect(() => readFixture('nonesuch')).toThrow(expect.objectContaining({ code: 'ENOENT' }));
});
