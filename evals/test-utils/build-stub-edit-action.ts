import { resolve } from 'node:path';
import type { EditAction } from '../../src/bypass/classify-edit.ts';
import { getEditFields } from '../../src/bypass/get-edit-fields.ts';

export interface RecordedCall {
  readonly tool: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly cwd: string;
}

// Stands in for the filesystem a recorded call ran against: no path is a link,
// the target sits in the call's cwd checkout, and the corpus holds no file
// content, so an Edit's file is its own old text.
export function buildStubEditAction(call: Readonly<RecordedCall>): EditAction {
  const fields = getEditFields(call.tool);
  const path = fields === null ? undefined : call.input[fields.path];
  const relative = typeof path === 'string' ? path : '';
  const target = resolve(call.cwd, relative);
  const old = call.input['old_string'];

  return {
    toolName: call.tool,
    toolInput: call.input,
    requested: target,
    target,
    checkout: call.cwd,
    current: typeof old === 'string' ? old : null,
  };
}
