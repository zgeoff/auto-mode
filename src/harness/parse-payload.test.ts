import { expect, test } from 'bun:test';
import { readFixture } from '../../test-utils/read-fixture.ts';
import { parsePayload } from './parse-payload.ts';

// Recorded from a live session of each harness. Muse and Codex both send
// turn_id, so only a real capture proves which key separates them.
test('it normalises a recorded Claude payload', () => {
  const payload = parsePayload(readFixture('claude'));

  expect(payload).toMatchObject({
    harness: 'claude',
    event: 'PreToolUse',
    toolName: 'Write',
    cwd: '/repo',
  });

  expect(payload?.transcriptPath).toInclude('.jsonl');
});

test('it normalises a recorded Muse payload', () => {
  expect(parsePayload(readFixture('muse'))).toMatchObject({
    harness: 'muse',
    event: 'PreToolUse',
    toolName: 'bash',
    toolInput: { command: 'echo probe-marker' },
  });
});

test('it normalises a recorded Codex payload', () => {
  expect(parsePayload(readFixture('codex'))).toMatchObject({
    harness: 'codex',
    event: 'PreToolUse',
    toolName: 'apply_patch',
  });
});

// Muse reports transcript_path as null on every event it sends, so a missing
// path is normal and not a reason to refuse the payload.
test('it accepts a payload that names no transcript', () => {
  expect(parsePayload(readFixture('muse'))?.transcriptPath).toBeUndefined();
});

test('it keeps the payload as it arrived for anything the shape drops', () => {
  const payload = parsePayload(readFixture('muse'));

  expect(Object.keys(payload?.raw ?? {})).toContain('model_provider');
});

const NOT_A_TOOL_CALL: [string, unknown][] = [
  ['a string', 'not an object'],
  ['null', null],
  ['an array', []],
  ['a payload from no known harness', { hook_event_name: 'PreToolUse', tool_name: 'Read' }],
  ['an event that is not a tool gate', { prompt_id: 'p', hook_event_name: 'Stop' }],
  ['a payload with no tool name', { prompt_id: 'p', hook_event_name: 'PreToolUse' }],
];

// A null is not a refusal: the caller stays out of the way and the harness
// decides for itself.
test.each(NOT_A_TOOL_CALL)('it has nothing to say about %s', (_label, body) => {
  expect(parsePayload(body)).toBeNull();
});

// A harness may send a field this shape names with a type it does not expect;
// dropping the whole payload there would leave the action unjudged.
test('it keeps judging a payload whose optional fields have the wrong type', () => {
  const payload = parsePayload({
    ...readFixture('muse'),
    session_id: 12_345,
    cwd: null,
    transcript_path: null,
  });

  expect(payload).toMatchObject({ harness: 'muse', toolName: 'bash' });
});

test('it falls back to the process working directory when the payload names none', () => {
  const payload = parsePayload({ ...readFixture('muse'), cwd: null });

  expect(payload?.cwd).toBe(process.cwd());
});

test('it reads a missing tool input as empty rather than refusing', () => {
  const payload = parsePayload({ ...readFixture('muse'), tool_input: 'not an object' });

  expect(payload?.toolInput).toStrictEqual({});
});
