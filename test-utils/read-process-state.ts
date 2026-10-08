import { readFile } from 'node:fs/promises';

export interface ProcessState {
  readonly state: string;
  readonly startTime: string;
}

// procfs fixes /proc/<pid>/stat: after the parenthesised command name, the
// first field is the state and the twentieth the start time, which tells a
// reused process ID apart from the process a test started.
export async function readProcessState(pid: number): Promise<ProcessState | null> {
  let stat: string;

  try {
    stat = await readFile(`/proc/${String(pid)}/stat`, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }

  const [state, ...rest] = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
  const startTime = rest.at(18);

  if (state === undefined || startTime === undefined) {
    throw new Error(`unreadable process stat for ${String(pid)}`);
  }

  return { state, startTime };
}
