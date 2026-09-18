import { expect, test } from 'bun:test';
import { detectHarness } from './detect-harness.ts';
import type { Harness } from './types.ts';

// Muse sends turn_id as well as model_provider, so testing turn_id first would
// call every Muse payload Codex.
test('it names Muse before Codex when a payload carries both keys', () => {
  expect(detectHarness({ model_provider: 'meta', turn_id: 't-1' })).toBe('muse');
});

const KEYS: [string, Harness][] = [
  ['model_provider', 'muse'],
  ['prompt_id', 'claude'],
  ['turn_id', 'codex'],
];

test.each(KEYS)('it names the harness that sends %s', (key, harness) => {
  expect(detectHarness({ [key]: 'value' })).toBe(harness);
});

test('it reads a key that is present and null as identifying', () => {
  expect(detectHarness({ model_provider: null })).toBe('muse');
});

test('it names nothing when no payload key identifies a harness', () => {
  expect(detectHarness({ hook_event_name: 'PreToolUse', tool_name: 'Read' })).toBeNull();
  expect(detectHarness({})).toBeNull();
});
