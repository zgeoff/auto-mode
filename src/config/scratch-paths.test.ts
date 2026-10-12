import { expect, test } from 'bun:test';
import { SCRATCH_PATHS } from './scratch-paths.ts';

test('it lists /tmp and the standard /dev streams as the locations every task may write', () => {
  expect(SCRATCH_PATHS).toStrictEqual(['/tmp', '/dev/null', '/dev/stdout', '/dev/stderr']);
});
