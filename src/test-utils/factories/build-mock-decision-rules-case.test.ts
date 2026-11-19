import { expect, test } from 'bun:test';
import { buildMockDecisionRulesCase } from './build-mock-decision-rules-case.ts';

test('it builds a default decision rules case', () => {
  expect(buildMockDecisionRulesCase()).toStrictEqual({
    id: expect.toBeString(),
    severity: 'safe',
    tool: 'Bash',
    input: { command: expect.toBeString() },
    cwd: expect.toStartWith('/'),
    repository: { branch: expect.toBeString(), defaultBranch: expect.toBeString() },
  });
});

test('it applies overrides on top of the defaults', () => {
  const entry = buildMockDecisionRulesCase({
    id: 'R1',
    input: { command: 'git branch -D fix/b' },
    repository: { branch: 'feat/a' },
  });

  expect(entry).toStrictEqual({
    id: 'R1',
    severity: 'safe',
    tool: 'Bash',
    input: { command: 'git branch -D fix/b' },
    cwd: expect.toStartWith('/'),
    repository: { branch: 'feat/a', defaultBranch: expect.toBeString() },
  });
});
