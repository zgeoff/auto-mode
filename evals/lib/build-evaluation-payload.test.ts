import { expect, test } from 'bun:test';
import { buildEvaluationPayload } from './build-evaluation-payload.ts';
import { buildMockEvaluationCase } from './factories/build-mock-evaluation-case.ts';

test('it builds the action request a case replays, run from the case cwd under the evaluation session', () => {
  const entry = buildMockEvaluationCase({
    tool: 'Bash',
    input: { command: 'git push origin main' },
    repositoryContext: { cwd: '/home/dev/app' },
  });

  expect(buildEvaluationPayload(entry)).toStrictEqual({
    sessionID: 'second-judge-evaluation',
    cwd: '/home/dev/app',
    toolName: 'Bash',
    toolInput: { command: 'git push origin main' },
  });
});
