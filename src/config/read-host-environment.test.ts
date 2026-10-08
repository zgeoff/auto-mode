import { expect, test } from 'bun:test';
import { readHostEnvironment } from './read-host-environment.ts';

test('it reads the process environment and home, with /tmp and the standard streams as scratch space', () => {
  expect(readHostEnvironment()).toStrictEqual({
    env: expect.toBeObject(),
    home: expect.toStartWith('/'),
    scratchPaths: ['/tmp', '/dev/null', '/dev/stdout', '/dev/stderr'],
  });
});
