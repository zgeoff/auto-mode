import { faker } from '@faker-js/faker';
import type { ActionLogRecord } from '../action-log-record-schema.ts';

// A final record of an allowed action decided by Jev. A deny, an escalation or a
// started record changes what the measures count, so a test opts into each.
export function buildMockActionLogRecord(
  overrides: Partial<ActionLogRecord> = {},
): ActionLogRecord {
  return {
    schemaVersion: 3,
    time: faker.date.recent().toISOString(),
    invocationID: faker.string.uuid(),
    sessionHash: faker.string.hexadecimal({ length: 16, casing: 'lower', prefix: '' }),
    actionHash: faker.string.hexadecimal({ length: 16, casing: 'lower', prefix: '' }),
    status: 'allow',
    verdict: 'allow',
    decidingStage: 'jev',
    denials: { consecutive: 0, session: 0 },
    escalation: false,
    diagnostics: null,
    ...overrides,
  };
}
