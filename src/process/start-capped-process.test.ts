import { expect, test } from 'bun:test';
import { text } from 'node:stream/consumers';
import { startCappedProcess } from './start-capped-process.ts';

test('it passes lines within the cap through unchanged', async () => {
  const child = startCappedProcess(
    process.execPath,
    ['-e', String.raw`process.stdout.write("one\ntwo\n")`],
    { maxLineBytes: 8 },
  );

  child.stdin.end();

  const output = await text(child.stdout);

  expect(output).toBe('one\ntwo\n');
});

test('it kills the child and errors its output when one line passes the cap', async () => {
  const child = startCappedProcess(
    process.execPath,
    ['-e', String.raw`process.stdout.write("ok\n" + "x".repeat(64)); setInterval(() => {}, 1000)`],
    { maxLineBytes: 16 },
  );

  const exited = new Promise<NodeJS.Signals | null>((resolve) => {
    child.once('exit', (_code, signal) => {
      resolve(signal);
    });
  });

  expect(text(child.stdout)).rejects.toThrow('a line of output passed 16 bytes');

  const signal = await exited;

  expect(signal).toBe('SIGKILL');
});
