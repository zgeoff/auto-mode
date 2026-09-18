import { expect, test } from 'bun:test';
import { readFixture } from './read-fixture.ts';

const HARNESSES: string[] = ['claude', 'codex', 'muse'];

test.each(HARNESSES)('it reads the recorded %s payload', (harness) => {
  expect(readFixture(harness)).toMatchObject({
    hook_event_name: 'PreToolUse',
    tool_name: expect.toBeString(),
  });
});

test('it fails loudly when no fixture is recorded for a harness', () => {
  expect(() => readFixture('nonesuch')).toThrow();
});
