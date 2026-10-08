import { expect, test } from 'bun:test';
import { buildStubOutput } from './build-stub-output.ts';

test('it reads back every write in the order it was written', () => {
  const output = buildStubOutput();

  output.write('first\n');
  output.write('second\n');

  expect(output.read()).toBe('first\nsecond\n');
});

test('it reads an empty string before any write', () => {
  expect(buildStubOutput().read()).toBe('');
});

test('it accepts a write the way an unblocked process stream does', () => {
  expect(buildStubOutput().write('text')).toBeTrue();
});
