import { expect, test } from 'bun:test';
import { CLI_LIMITS } from './cli-limits.ts';

test('it stops the run after startup, the key command, Jev and two judge calls at their limits', () => {
  expect(CLI_LIMITS).toStrictEqual({
    keyCommandMs: 5000,
    jevMs: 5000,
    judgeMs: 120_000,
    evaluationMs: 5000 + 5000 + 5000 + 120_000 + 120_000,
  });
});
