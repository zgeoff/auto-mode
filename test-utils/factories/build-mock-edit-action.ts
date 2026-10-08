import { faker } from '@faker-js/faker';
import type { EditAction } from '../../src/bypass/classify-edit.ts';

// A Write of plain text that no link redirects: the requested path and the
// tool's file path follow the target unless a test overrides them.
export function buildMockEditAction(overrides: Partial<EditAction> = {}): EditAction {
  const target = overrides.target ?? faker.system.filePath();

  return {
    toolName: 'Write',
    toolInput: { file_path: target, content: faker.lorem.sentence() },
    requested: target,
    target,
    checkout: null,
    current: null,
    ...overrides,
  };
}
