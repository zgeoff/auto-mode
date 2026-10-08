import { expect, test } from 'bun:test';
import { formatClassifierNote } from './format-classifier-note.ts';

test('it removes the configured key from every diagnostic occurrence', () => {
  const note = formatClassifierNote('test-secret failed with test-secret', 'test-secret');

  expect(note).toBe('[redacted] failed with [redacted]');
});

test('it preserves a diagnostic when no key exists', () => {
  expect(formatClassifierNote('no key configured', null)).toBe('no key configured');
});

test('it preserves a diagnostic when the key is empty', () => {
  expect(formatClassifierNote('no key configured', '')).toBe('no key configured');
});
