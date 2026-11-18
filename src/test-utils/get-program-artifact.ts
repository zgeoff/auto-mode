import type { ProgramLaunch } from '@zgeoff/rig/e2e';
import invariant from 'tiny-invariant';

// The file the program's command runs, which is the last word of the command.
export function getProgramArtifact(program: ProgramLaunch): string {
  const artifact = program.command.at(-1);

  invariant(artifact !== undefined, 'the program has an empty command');

  return artifact;
}
