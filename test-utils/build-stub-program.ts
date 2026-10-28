import { mock } from 'bun:test';
import type { ProgramResult, RunProgram } from '../scripts/run-program.ts';

export function buildStubProgram(
  answers: Readonly<Record<string, readonly ProgramResult[]>>,
): ReturnType<typeof mock<RunProgram>> {
  const queues = new Map(
    Object.entries(answers).map(([command, results]) => [command, [...results]]),
  );

  return mock<RunProgram>((argv) => {
    const command = argv.join(' ');
    const result = queues.get(command)?.shift();

    if (result === undefined) {
      throw new Error(`the stub program has no answer left for: ${command}`);
    }

    return result;
  });
}
