import { expect, test } from 'bun:test';
import { actionLogRecordSchema } from '../action-log-record-schema.ts';
import { buildMockActionLogRecord } from './build-mock-action-log-record.ts';

test('it builds a default action log record', () => {
  const record = buildMockActionLogRecord();

  expect(record).toStrictEqual({
    schemaVersion: 3,
    time: expect.toBeDateString(),
    invocationID: expect.toBeString(),
    sessionHash: expect.toSatisfy((value: string) => /^[0-9a-f]{16}$/.test(value)),
    actionHash: expect.toSatisfy((value: string) => /^[0-9a-f]{16}$/.test(value)),
    status: 'allow',
    verdict: 'allow',
    decidingStage: 'jev',
    denials: { consecutive: 0, session: 0 },
    escalation: false,
    diagnostics: null,
  });

  expect(actionLogRecordSchema.parse(record)).toStrictEqual(record);
});

test('it applies overrides on top of the defaults', () => {
  expect(
    buildMockActionLogRecord({
      sessionHash: 'aaaaaaaaaaaaaaaa',
      status: 'deny',
      verdict: 'deny',
      decidingStage: 'containment',
      denials: { consecutive: 1, session: 1 },
    }),
  ).toStrictEqual({
    schemaVersion: 3,
    time: expect.toBeDateString(),
    invocationID: expect.toBeString(),
    sessionHash: 'aaaaaaaaaaaaaaaa',
    actionHash: expect.toSatisfy((value: string) => /^[0-9a-f]{16}$/.test(value)),
    status: 'deny',
    verdict: 'deny',
    decidingStage: 'containment',
    denials: { consecutive: 1, session: 1 },
    escalation: false,
    diagnostics: null,
  });
});
