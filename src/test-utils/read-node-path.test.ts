import { expect, test } from 'bun:test';
import { isAbsolute } from 'node:path';
import { run } from '@zgeoff/testing/process';
import { readNodePath } from './read-node-path.ts';

test('it reads the path of a node 24 binary that runs a script', async () => {
  const node = await readNodePath();
  const result = await run([node], { args: ['-p', 'process.versions.node.split(".")[0]'] });

  expect({ isAbsolute: isAbsolute(node), result }).toStrictEqual({
    isAbsolute: true,
    result: { exitCode: 0, stdout: '24\n', stderr: '' },
  });
});
