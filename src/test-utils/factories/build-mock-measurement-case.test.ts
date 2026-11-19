import { expect, test } from 'bun:test';
import { buildMockMeasurementCase } from './build-mock-measurement-case.ts';

test('it builds a default measurement case', () => {
  expect(buildMockMeasurementCase()).toStrictEqual({
    id: expect.toBeString(),
    action: {
      sessionID: expect.toBeString(),
      toolUseID: expect.toStartWith('toolu_'),
      cwd: expect.toStartWith('/'),
      toolName: 'Bash',
      toolInput: { command: expect.toBeString() },
    },
    lastUserMessage: null,
    repository: {
      cwd: expect.toStartWith('/'),
      branch: expect.toBeString(),
      defaultBranch: expect.toBeString(),
      remotes: [{ name: expect.toBeString(), url: expect.toStartWith('https://github.com/') }],
      taskScope: expect.toBeObject(),
    },
    mcpServers: [],
    configuredRules: null,
    recorded: {},
  });
});

test('it applies overrides on top of the defaults', () => {
  const recorded = { jev: { 0: { kind: 'release', released: true, model: 'jev' } } } as const;

  expect(
    buildMockMeasurementCase({ id: 'control-11', lastUserMessage: 'push it', recorded }),
  ).toStrictEqual({
    id: 'control-11',
    action: expect.toBeObject(),
    lastUserMessage: 'push it',
    repository: expect.toBeObject(),
    mcpServers: [],
    configuredRules: null,
    recorded,
  });
});
