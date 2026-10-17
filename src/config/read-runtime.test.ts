import { expect, test } from 'bun:test';
import { readRuntime } from './read-runtime.ts';

test('it reads the process host, the wall clock, the real timers, fetch and the git checkout lookup', () => {
  expect(readRuntime()).toStrictEqual({
    host: {
      env: process.env,
      home: expect.toStartWith('/'),
      scratchPaths: ['/tmp', '/dev/null', '/dev/stdout', '/dev/stderr'],
    },
    now: Date.now,
    timeout: expect.any(Function),
    fetch: expect.any(Function),
    findCheckout: expect.any(Function),
  });
});

test('it reads the wall clock', () => {
  const before = Date.now();

  expect(readRuntime().now()).toBeWithin(before, Date.now() + 1);
});
