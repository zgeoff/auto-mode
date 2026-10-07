import { expect, test } from 'bun:test';
import { readFixture } from './read-fixture.ts';

const FIXTURES: string[] = ['mod-request-regenerable', 'mod-request-write'];

test.each(FIXTURES)('it reads the recorded %s fixture', (name) => {
  expect(readFixture(name)).toMatchObject({
    sessionID: expect.toBeString(),
    toolName: expect.toBeString(),
  });
});

test('it fails loudly when no fixture is recorded under a name', () => {
  expect(() => readFixture('nonesuch')).toThrow();
});
