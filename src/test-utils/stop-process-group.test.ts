import { expect, mock, onTestFinished, test } from 'bun:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import invariant from 'tiny-invariant';
import { stopProcessGroup } from './stop-process-group.ts';

test('it kills the leader of a running group with SIGKILL', async () => {
  const leader = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' });

  invariant(leader.pid !== undefined, 'the leader started');

  const group = leader.pid;

  onTestFinished(() => {
    stopProcessGroup(group);
  });

  const exited = once(leader, 'exit');

  stopProcessGroup(group);

  const exit = await exited;

  expect(exit).toStrictEqual([null, 'SIGKILL']);
});

test('it returns quietly for a group that has already exited', async () => {
  const leader = spawn('true', [], { detached: true, stdio: 'ignore' });

  invariant(leader.pid !== undefined, 'the leader started');

  const group = leader.pid;

  await once(leader, 'exit');

  expect(() => {
    stopProcessGroup(group);
  }).not.toThrow();
});

test('it rethrows a failure other than a group that is gone', () => {
  const kill = mock(() => {
    throw Object.assign(new Error('kill EPERM'), { code: 'EPERM' });
  });

  expect(() => {
    stopProcessGroup(4242, kill);
  }).toThrowWithMessage(Error, 'kill EPERM');
});

test.each([
  ['0', 0],
  ['1', 1],
  ['a negative number', -5],
  ['a fraction', 2.5],
])('it refuses to stop process group %s', (_label, group) => {
  const kill = mock<(pid: number, signal: NodeJS.Signals) => void>();

  expect(() => {
    stopProcessGroup(group, kill);
  }).toThrowWithMessage(Error, `refusing to stop process group ${String(group)}`);

  expect(kill).not.toHaveBeenCalled();
});

test('it signals the group, not its leader alone', () => {
  const kill = mock<(pid: number, signal: NodeJS.Signals) => void>();

  stopProcessGroup(4242, kill);

  expect(kill).toHaveBeenCalledExactlyOnceWith(-4242, 'SIGKILL');
});
