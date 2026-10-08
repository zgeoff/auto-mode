import type { EditFileReader } from '../src/bypass/try-classify-edit.ts';

export interface StubEditFiles {
  readonly checkout: string | null;
  readonly checkoutError?: string;
  readonly links?: Readonly<Record<string, string>>;
  readonly files?: Readonly<Record<string, string>>;
}

// Stands in for the filesystem and git under the edit bypass: a path resolves
// through the listed links or to itself, git places every path in the one
// checkout given or fails with the checkout error, and only listed files read.
export function buildStubEditFileReader(stub: Readonly<StubEditFiles>): EditFileReader {
  const checkout =
    stub.checkout === null ? null : { worktree: stub.checkout, commonDir: `${stub.checkout}/.git` };

  return {
    resolveEditTarget: (path) => Promise.resolve(stub.links?.[path] ?? path),
    findCheckout: () =>
      stub.checkoutError === undefined
        ? Promise.resolve(checkout)
        : Promise.reject(new Error(stub.checkoutError)),
    readFile: (path) => {
      const content = stub.files?.[path];

      return content === undefined
        ? Promise.reject(new Error(`ENOENT: no such file, open '${path}'`))
        : Promise.resolve(content);
    },
  };
}
