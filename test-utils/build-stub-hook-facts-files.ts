import { setImmediate } from 'node:timers/promises';
import type { HookFactsFiles } from '../src/git/types.ts';

export interface StubHookFactsFiles {
  readonly files: HookFactsFiles;
  readonly readStats: () => { readonly peakReads: number; readonly bytesRead: number };
}

// A text past the limit rejects as node's reader does. Each read waits a turn
// of the event loop, so reads that run together overlap.
export function buildStubHookFactsFiles(
  configs: Readonly<Record<string, string>>,
): StubHookFactsFiles {
  let reads = 0;
  let peakReads = 0;
  let bytesRead = 0;

  return {
    files: {
      readText: async (path, maxBytes) => {
        reads += 1;
        peakReads = Math.max(peakReads, reads);

        await setImmediate();

        reads -= 1;

        const text = configs[path] ?? null;
        const size = Buffer.byteLength(text ?? '');

        if (size > maxBytes) {
          throw new Error(`${path} is larger than a git config this reader reads`);
        }

        bytesRead += size;

        return text;
      },
      probeFile: (path) => Promise.resolve(path in configs),
    },
    readStats: () => ({ peakReads, bytesRead }),
  };
}
