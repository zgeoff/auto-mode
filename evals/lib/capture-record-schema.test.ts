import { expect, test } from 'bun:test';
import type * as z from 'zod';
import { captureRecordSchema } from './capture-record-schema.ts';

test('it accepts a capture record with a deny verdict', () => {
  const payload: z.input<typeof captureRecordSchema> = {
    schemaVersion: 1,
    time: '2026-10-10T12:00:00.000Z',
    request: {
      sessionID: 's-1',
      toolUseID: 't-1',
      cwd: '/tmp',
      toolName: 'Bash',
      toolInput: { command: 'make deploy' },
      context: {
        agentID: null,
        originalUserTask: null,
        delegatedTask: null,
        lastDirectUserMessage: { text: 'deploy', origin: 'composer' },
        omittedTaskContext: [],
      },
    },
    verdict: { kind: 'deny', rule: 'Production Deploy', reason: 'reason' },
    decidingStage: 'jev',
    escalation: false,
  };

  expect(captureRecordSchema.safeParse(payload).data).toStrictEqual(payload);
});

test('it rejects a capture record with a deciding stage it does not know', () => {
  const result = captureRecordSchema.safeParse({
    schemaVersion: 1,
    time: '2026-10-10T12:00:00.000Z',
    request: {
      sessionID: 's-1',
      toolUseID: 't-1',
      cwd: '/tmp',
      toolName: 'Bash',
      toolInput: { command: 'make deploy' },
      context: {
        agentID: null,
        originalUserTask: null,
        delegatedTask: null,
        lastDirectUserMessage: { text: 'deploy', origin: 'composer' },
        omittedTaskContext: [],
      },
    },
    verdict: { kind: 'deny', rule: 'Production Deploy', reason: 'reason' },
    decidingStage: 'judge',
    escalation: false,
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['decidingStage'] });
});
