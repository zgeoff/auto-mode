import type { ProgramLaunch } from '@zgeoff/rig/e2e';

// rig runs a built .js artifact with bun. The artifact ships for node, so the e2e suites run the
// same file under the node binary they are given.
export function buildNodeCommand(program: ProgramLaunch, node: string): readonly string[] {
  const [runner, ...rest] = program.command;

  return runner === 'bun' ? [node, ...rest] : program.command;
}
