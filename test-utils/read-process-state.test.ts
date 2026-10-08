import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { readProcessState } from './read-process-state.ts';

test('it reads the state and start time of a running process', async () => {
  const state = await readProcessState(process.pid);

  expect(state).toStrictEqual({
    state: expect.toBeOneOf(['R', 'S']),
    startTime: expect.toBeString(),
  });
});

// The kernel hands out process IDs below pid_max, so that number never names a
// process.
test('it reads nothing for a process ID no process holds', async () => {
  const pidMax = await readFile('/proc/sys/kernel/pid_max', 'utf8');
  const state = await readProcessState(Number(pidMax));

  expect(state).toBeNull();
});
