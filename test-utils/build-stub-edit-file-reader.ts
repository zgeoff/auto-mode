import type { EditFileReader } from '../src/bypass/try-classify-edit.ts';

export interface StubEditFiles {
  readonly checkout: string | null;
  readonly checkoutError?: string;
  readonly links?: Readonly<Record<string, string>>;
  readonly files?: Readonly<Record<string, string>>;
}

export function buildStubEditFileReader(stub: Readonly<StubEditFiles>): EditFileReader {
  const checkout =
    stub.checkout === null
      ? null
      : {
          worktree: stub.checkout,
          gitDir: `${stub.checkout}/.git`,
          commonDir: `${stub.checkout}/.git`,
        };

  return {
    resolveEditTarget: (path) => Promise.resolve(stub.links?.[path] ?? path),
    readCheckout: () =>
      stub.checkoutError === undefined
        ? Promise.resolve(checkout)
        : Promise.reject(new Error(stub.checkoutError)),
    readFile: (path) => {
      const content = stub.files?.[path];

      // a missing file rejects with the error that node's readFile gives
      return content === undefined
        ? Promise.reject(
            Object.assign(new Error(`ENOENT: no such file or directory, open '${path}'`), {
              errno: -2,
              code: 'ENOENT',
              syscall: 'open',
              path,
            }),
          )
        : Promise.resolve(content);
    },
  };
}
