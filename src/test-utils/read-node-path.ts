import { run } from '@zgeoff/testing/process';
import invariant from 'tiny-invariant';
import * as z from 'zod';

const runtimeSchema = z.object({ node: z.string(), version: z.string() });

// A version manager's node shim reads its config under the user's HOME, which a child with a HOME
// in the temp folder lacks. The child runs the binary the shim resolves to, at the path this reads.
export async function readNodePath(): Promise<string> {
  const result = await run(['node'], {
    args: ['-p', 'JSON.stringify({ node: process.execPath, version: process.versions.node })'],
  });

  const runtime = runtimeSchema.parse(JSON.parse(result.stdout));

  invariant(
    runtime.version.startsWith('24.'),
    `node 24 runs the built artifact, not node ${runtime.version}`,
  );

  return runtime.node;
}
