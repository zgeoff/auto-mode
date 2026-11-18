import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// The Agent SDK runs the `claude` it finds on the PATH, and MSW cannot reach a
// spawned process, so a script on a test's PATH runs the stub in its place.
export async function createStubClaude(directory: string): Promise<string> {
  const binDir = join(directory, 'bin');

  await mkdir(binDir, { recursive: true });

  await writeFile(
    join(binDir, 'claude'),
    `#!/bin/sh\nexec "${process.execPath}" "${join(import.meta.dir, 'run-stub-claude.ts')}" "$@"\n`,
    { mode: 0o755 },
  );

  return binDir;
}
