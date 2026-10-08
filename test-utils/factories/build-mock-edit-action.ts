import { faker } from '@faker-js/faker';
import type { EditAction } from '../../src/bypass/classify-edit.ts';

export function buildMockEditAction(overrides: Partial<EditAction> = {}): EditAction {
  const { toolInput, ...rest } = overrides;
  const toolName = overrides.toolName ?? 'Write';
  const target = overrides.target ?? faker.system.filePath();

  return {
    toolName,
    requested: target,
    target,
    checkout: null,
    current: null,
    ...rest,
    toolInput: { ...buildToolInput(toolName, target), ...toolInput },
  };
}

function buildToolInput(toolName: string, target: string): Record<string, unknown> {
  if (toolName === 'Write') {
    return { file_path: target, content: faker.lorem.sentence() };
  }

  if (toolName === 'Edit') {
    return { file_path: target, old_string: faker.lorem.word(), new_string: faker.lorem.word() };
  }

  if (toolName === 'NotebookEdit') {
    return { notebook_path: target, new_source: faker.lorem.sentence() };
  }

  return {};
}
