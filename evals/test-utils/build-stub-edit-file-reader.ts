import type { EditFileReader } from '../../src/bypass/try-classify-edit.ts';

export interface RecordedCall {
  readonly tool: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly cwd: string;
}

// Stands in for the filesystem a recorded call ran against: no path is a link,
// every path sits in the call's cwd checkout, and the corpus holds no file
// content, so an Edit's file is its own old text.
export function buildStubEditFileReader(call: Readonly<RecordedCall>): EditFileReader {
  const old = call.input['old_string'];

  return {
    resolveEditTarget: (path) => Promise.resolve(path),
    findCheckout: () => Promise.resolve({ worktree: call.cwd, commonDir: `${call.cwd}/.git` }),
    readFile: (path) =>
      typeof old === 'string'
        ? Promise.resolve(old)
        : Promise.reject(new Error(`The recording holds no content for ${path}`)),
  };
}
