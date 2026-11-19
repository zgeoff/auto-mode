import { expect, test } from 'bun:test';
import { buildNodeCommand } from './build-node-command.ts';

test('it swaps the bun runner of a built script for the given node binary', () => {
  const command = buildNodeCommand(
    { command: ['bun', '/repo/dist/cli.js'], cwd: '/repo' },
    '/opt/node/bin/node',
  );

  expect(command).toStrictEqual(['/opt/node/bin/node', '/repo/dist/cli.js']);
});

test('it keeps a command that bun does not run', () => {
  const command = buildNodeCommand(
    { command: ['/repo/dist/cli'], cwd: '/repo' },
    '/opt/node/bin/node',
  );

  expect(command).toStrictEqual(['/repo/dist/cli']);
});
