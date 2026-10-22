import type { HookFactsFiles } from '../src/git/types.ts';

export interface CountingHookFactsFiles {
  readonly files: HookFactsFiles;
  readonly readStats: () => { readonly peakReads: number; readonly bytesRead: number };
}

export function buildCountingHookFactsFiles(files: HookFactsFiles): CountingHookFactsFiles {
  let reads = 0;
  let peakReads = 0;
  let bytesRead = 0;

  return {
    files: {
      readText: async (path, maxBytes) => {
        reads += 1;
        peakReads = Math.max(peakReads, reads);

        try {
          const text = await files.readText(path, maxBytes);

          bytesRead += Buffer.byteLength(text ?? '');

          return text;
        } finally {
          reads -= 1;
        }
      },
      probeFile: (path) => files.probeFile(path),
    },
    readStats: () => ({ peakReads, bytesRead }),
  };
}
