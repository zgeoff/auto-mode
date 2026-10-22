import { constants } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { access, open } from 'node:fs/promises';
import type { HookFactsFiles } from './types.ts';

export const nodeHookFactsFiles: HookFactsFiles = {
  readText: async (path) => {
    if (path === '/dev/null') {
      return '';
    }

    let handle: FileHandle;

    try {
      // A non-blocking open returns at once for a pipe with no writer.
      handle = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
    } catch (error) {
      if (isMissingFileError(error)) {
        return null;
      }

      throw error;
    }

    try {
      return await readBoundedText(handle, path);
    } finally {
      await handle.close();
    }
  },
  probeFile: async (path) => {
    try {
      await access(path);

      return true;
    } catch (error) {
      if (isMissingFileError(error)) {
        return false;
      }

      throw error;
    }
  },
};

// A path under a file that is not a folder fails with ENOTDIR, and names no
// file all the same.
function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR')
  );
}

// The pending command names some of these paths, so a read never waits on a
// writer and never holds more than a hand-written git config would need.
const MAX_CONFIG_BYTES = 1_048_576;

// The checks run on the open handle, so a path swapped after the open cannot
// pass them.
async function readBoundedText(handle: FileHandle, path: string): Promise<string> {
  const stats = await handle.stat();

  if (!stats.isFile()) {
    throw new Error(`${path} is not a regular file`);
  }

  if (stats.size > MAX_CONFIG_BYTES) {
    throw new Error(`${path} is larger than a git config this reader reads`);
  }

  // One byte past the size shows a file that grew after the stat.
  const buffer = Buffer.alloc(stats.size + 1);
  let total = 0;

  for (;;) {
    const result = await handle.read(buffer, total, buffer.length - total, total);

    total += result.bytesRead;

    if (result.bytesRead === 0 || total === buffer.length) {
      break;
    }
  }

  if (total > stats.size) {
    throw new Error(`${path} grew while this reader read it`);
  }

  return buffer.toString('utf8', 0, total);
}
