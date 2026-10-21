import { access, readFile } from 'node:fs/promises';
import type { HookFactsFiles } from './types.ts';

export const nodeHookFactsFiles: HookFactsFiles = {
  readText: async (path) => {
    try {
      return await readFile(path, 'utf8');
    } catch (error) {
      if (isMissingFileError(error)) {
        return null;
      }

      throw error;
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
