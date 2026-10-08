import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface ProcessState {
  readonly state: string;
  readonly startTime: string;
}

// A process that exits between the open and the read of its stat file fails
// the read with ESRCH, not ENOENT.
const GONE_CODES = new Set(['ENOENT', 'ESRCH']);

// procfs fixes /proc/<pid>/stat: after the parenthesised command name, the
// first field is the state and the twentieth the start time, which tells a
// reused process ID apart from the process a test started.
export async function loadProcessState(
  pid: number,
  procDir = '/proc',
  readStat: (path: string) => Promise<string> = (path) => readFile(path, 'utf8'),
): Promise<ProcessState | null> {
  let stat: string;

  try {
    stat = await readStat(join(procDir, String(pid), 'stat'));
  } catch (error) {
    if (error instanceof Error && 'code' in error && GONE_CODES.has(String(error.code))) {
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
