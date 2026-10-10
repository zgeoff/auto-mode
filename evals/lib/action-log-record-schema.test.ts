import { expect, test } from 'bun:test';
import { actionLogRecordSchema } from './action-log-record-schema.ts';

test('it accepts a started record', () => {
  const payload = {
    schemaVersion: 3,
    time: '2026-10-01T10:00:00.000Z',
    invocationID: 'invocation-1',
    sessionHash: 'ad9ef8a88622d2c9',
    actionHash: 'f5d171dc69611257',
    status: 'started',
    verdict: null,
    decidingStage: null,
    denials: null,
    escalation: false,
    diagnostics: null,
  } as const;

  expect(actionLogRecordSchema.safeParse(payload).data).toStrictEqual(payload);
});

test('it accepts an escalated record with no action hash and Jev diagnostics', () => {
  const payload = {
    schemaVersion: 3,
    time: '2026-10-01T10:00:01.000Z',
    invocationID: 'invocation-1',
    sessionHash: 'ad9ef8a88622d2c9',
    actionHash: null,
    status: 'deny',
    verdict: 'defer',
    decidingStage: 'budget',
    denials: { consecutive: 0, session: 0 },
    escalation: true,
    diagnostics: { status: 'deny', stage: 'response' },
  } as const;

  expect(actionLogRecordSchema.safeParse(payload).data).toStrictEqual(payload);
});

test('it rejects a session identifier that is not a 16-digit hash', () => {
  const result = actionLogRecordSchema.safeParse({
    schemaVersion: 3,
    time: '2026-10-01T10:00:00.000Z',
    invocationID: 'invocation-1',
    sessionHash: 'raw-session-id',
    actionHash: 'f5d171dc69611257',
    status: 'started',
    verdict: null,
    decidingStage: null,
    denials: null,
    escalation: false,
    diagnostics: null,
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['sessionHash'] });
});

test('it rejects a field the version 3 record does not hold', () => {
  const result = actionLogRecordSchema.safeParse({
    schemaVersion: 3,
    time: '2026-10-01T10:00:00.000Z',
    invocationID: 'invocation-1',
    sessionHash: 'ad9ef8a88622d2c9',
    actionHash: 'f5d171dc69611257',
    status: 'started',
    verdict: null,
    decidingStage: null,
    denials: null,
    escalation: false,
    diagnostics: null,
    harness: 'claude',
  });

  expect(result.error?.issues).toPartiallyContain({ code: 'unrecognized_keys' });
});
