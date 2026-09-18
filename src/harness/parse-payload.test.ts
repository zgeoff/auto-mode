import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { detectHarness } from './detect-harness.ts';
import { parsePayload } from './parse-payload.ts';
import { renderVerdict } from './render-verdict.ts';

function fixture(name: string): Record<string, unknown> {
  const path = join(import.meta.dirname, '..', '..', 'fixtures', `${name}-pre-tool-use.json`);

  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

// Captured from a live Muse 1.3.0 session, a real Claude payload, and a real
// Codex payload. Muse and Codex both send turn_id, so only model_provider
// separates them, and only a real capture proves that.
test.each([
  ['claude', 'claude'],
  ['codex', 'codex'],
  ['muse', 'muse'],
])('it names the %s harness from its own payload', (name, harness) => {
  expect(detectHarness(fixture(name))).toBe(harness);
});

test('it reads an unknown payload as nothing to say rather than as an error', () => {
  expect(detectHarness({ hook_event_name: 'PreToolUse' })).toBeNull();
  expect(parsePayload('not an object')).toBeNull();
  expect(parsePayload(null)).toBeNull();
  expect(parsePayload([])).toBeNull();
});

test('it normalises every harness to the same shape', () => {
  const claude = parsePayload(fixture('claude'));
  const muse = parsePayload(fixture('muse'));

  expect(claude).toMatchObject({
    harness: 'claude',
    event: 'PreToolUse',
    toolName: 'Write',
    cwd: '/repo',
  });

  expect(claude?.transcriptPath).toContain('.jsonl');

  expect(muse).toMatchObject({ harness: 'muse', event: 'PreToolUse', toolName: 'bash' });

  // Muse reports transcript_path as null on every event it sends.
  expect(muse?.transcriptPath).toBeUndefined();
  expect(muse?.toolInput).toMatchObject({ command: 'echo probe-marker' });
});

test('it ignores events that are not a tool gate', () => {
  expect(parsePayload({ ...fixture('claude'), hook_event_name: 'Stop' })).toBeNull();
});

test('it renders the three verdicts in the shape every harness reads', () => {
  expect(JSON.parse(renderVerdict('PreToolUse', { kind: 'allow' }))).toStrictEqual({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' },
  });

  expect(JSON.parse(renderVerdict('PreToolUse', { kind: 'ask' }))).toStrictEqual({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask' },
  });

  expect(
    JSON.parse(
      renderVerdict('PreToolUse', {
        kind: 'deny',
        rule: 'Data Exfiltration',
        reason: 'the request body carries a credential.',
      }),
    ),
  ).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: '[Data Exfiltration] the request body carries a credential.',
    },
  });
});
