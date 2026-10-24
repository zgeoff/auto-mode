type KillGroup = (pid: number, signal: NodeJS.Signals) => void;

// A negative pid signals the whole group; 0 and 1 would signal this test's own
// group or every process the user owns.
export function stopProcessGroup(
  group: number,
  kill: KillGroup = (pid, signal) => {
    process.kill(pid, signal);
  },
): void {
  if (!Number.isInteger(group) || group <= 1) {
    throw new Error(`refusing to stop process group ${String(group)}`);
  }

  try {
    kill(-group, 'SIGKILL');
  } catch (error) {
    // A group whose processes have all exited is already stopped.
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH') {
      return;
    }

    throw error;
  }
}
