import { faker } from '@faker-js/faker';
import type { AtcSessionRecord } from '../../src/scope/load-atc-session-record.ts';

type RecordScope = AtcSessionRecord['scope'];

interface AtcSessionRecordOverrides extends Partial<Omit<AtcSessionRecord, 'scope'>> {
  readonly scope?: Partial<Omit<RecordScope, 'workspace'>> & {
    readonly workspace?: Partial<RecordScope['workspace']>;
  };
}

// The format and version identify the record; the lists beyond the workspace
// grant ownership, so each starts empty.
export function buildMockAtcSessionRecord(
  overrides: AtcSessionRecordOverrides = {},
): AtcSessionRecord {
  const { scope, ...rest } = overrides;
  const { workspace, ...scopeRest } = scope ?? {};

  return {
    format: 'atc.session-record',
    version: 1,
    session: faker.string.uuid(),
    ...rest,
    scope: {
      worktrees: [],
      branches: [],
      pullRequests: [],
      ...scopeRest,
      workspace: {
        path: `/${faker.system.directoryPath().replaceAll(/^\/+/g, '')}`,
        branch: faker.git.branch(),
        ...workspace,
      },
    },
  };
}
