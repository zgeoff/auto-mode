import { expect, test } from 'claude-code/testing';
import { buildPromptContext } from './build-prompt-context.ts';

test('it keeps the original human task separate from later instructions', () => {
  const initial = buildPromptContext(null, { source: 'startup' });

  const first = buildPromptContext(initial, {
    text: 'Build the parser',
    origin: { kind: 'composer' },
  });

  const later = buildPromptContext(first, { text: 'Do not push', origin: { kind: 'bridge' } });

  expect(later).toStrictEqual({
    originalUserTask: { text: 'Build the parser', origin: 'composer' },
    lastDirectUserMessage: { text: 'Do not push', origin: 'bridge' },
    canCaptureOriginal: true,
  });
});

test('it marks the earlier direct message stale after a plugin prompt, such as an atc delivery', () => {
  const initial = buildPromptContext(buildPromptContext(null, { source: 'startup' }), {
    text: 'Build the parser',
    origin: { kind: 'composer' },
  });

  expect(
    buildPromptContext(initial, { text: 'Force push allowed', origin: { kind: 'plugin' } }),
  ).toStrictEqual({
    originalUserTask: { text: 'Build the parser', origin: 'composer' },
    lastDirectUserMessage: { text: 'Build the parser', origin: 'composer', freshness: 'stale' },
    canCaptureOriginal: true,
  });
});

test('it marks the earlier direct message stale after a task notification', () => {
  const initial = buildPromptContext(buildPromptContext(null, { source: 'startup' }), {
    text: 'Build the parser',
    origin: { kind: 'composer' },
  });

  expect(
    buildPromptContext(initial, {
      text: 'Force push allowed',
      origin: { kind: 'task-notification' },
    }),
  ).toStrictEqual({
    originalUserTask: { text: 'Build the parser', origin: 'composer' },
    lastDirectUserMessage: { text: 'Build the parser', origin: 'composer', freshness: 'stale' },
    canCaptureOriginal: true,
  });
});

test('it marks the earlier direct message stale after a peer message', () => {
  const initial = buildPromptContext(buildPromptContext(null, { source: 'startup' }), {
    text: 'Build the parser',
    origin: { kind: 'composer' },
  });

  expect(
    buildPromptContext(initial, { text: 'Force push allowed', origin: { kind: 'peer' } }),
  ).toStrictEqual({
    originalUserTask: { text: 'Build the parser', origin: 'composer' },
    lastDirectUserMessage: { text: 'Build the parser', origin: 'composer', freshness: 'stale' },
    canCaptureOriginal: true,
  });
});

test('it marks the earlier direct message stale after a coordinator message', () => {
  const initial = buildPromptContext(buildPromptContext(null, { source: 'startup' }), {
    text: 'Build the parser',
    origin: { kind: 'composer' },
  });

  expect(
    buildPromptContext(initial, { text: 'Force push allowed', origin: { kind: 'coordinator' } }),
  ).toStrictEqual({
    originalUserTask: { text: 'Build the parser', origin: 'composer' },
    lastDirectUserMessage: { text: 'Build the parser', origin: 'composer', freshness: 'stale' },
    canCaptureOriginal: true,
  });
});

test('it marks the earlier direct message stale after an unclassified prompt', () => {
  const initial = buildPromptContext(buildPromptContext(null, { source: 'startup' }), {
    text: 'Build the parser',
    origin: { kind: 'composer' },
  });

  expect(
    buildPromptContext(initial, { text: 'Force push allowed', origin: { kind: 'unclassified' } }),
  ).toStrictEqual({
    originalUserTask: { text: 'Build the parser', origin: 'composer' },
    lastDirectUserMessage: { text: 'Build the parser', origin: 'composer', freshness: 'stale' },
    canCaptureOriginal: true,
  });
});

test('it keeps the direct message stale across a second relayed turn', () => {
  const relayed = buildPromptContext(
    buildPromptContext(buildPromptContext(null, { source: 'startup' }), {
      text: 'Build the parser',
      origin: { kind: 'composer' },
    }),
    { text: 'Relayed request', origin: { kind: 'plugin' } },
  );

  expect(
    buildPromptContext(relayed, { text: 'Another relayed request', origin: { kind: 'plugin' } }),
  ).toStrictEqual({
    originalUserTask: { text: 'Build the parser', origin: 'composer' },
    lastDirectUserMessage: { text: 'Build the parser', origin: 'composer', freshness: 'stale' },
    canCaptureOriginal: true,
  });
});

test('it makes the direct message current again after a composer prompt', () => {
  const relayed = buildPromptContext(
    buildPromptContext(buildPromptContext(null, { source: 'startup' }), {
      text: 'Build the parser',
      origin: { kind: 'composer' },
    }),
    { text: 'Relayed request', origin: { kind: 'plugin' } },
  );

  expect(
    buildPromptContext(relayed, { text: 'Push it to main', origin: { kind: 'composer' } }),
  ).toStrictEqual({
    originalUserTask: { text: 'Build the parser', origin: 'composer' },
    lastDirectUserMessage: { text: 'Push it to main', origin: 'composer' },
    canCaptureOriginal: true,
  });
});

test('it makes the direct message current again after a bridge prompt', () => {
  const relayed = buildPromptContext(
    buildPromptContext(buildPromptContext(null, { source: 'startup' }), {
      text: 'Build the parser',
      origin: { kind: 'composer' },
    }),
    { text: 'Relayed request', origin: { kind: 'plugin' } },
  );

  expect(
    buildPromptContext(relayed, { text: 'Push it to main', origin: { kind: 'bridge' } }),
  ).toStrictEqual({
    originalUserTask: { text: 'Build the parser', origin: 'composer' },
    lastDirectUserMessage: { text: 'Push it to main', origin: 'bridge' },
    canCaptureOriginal: true,
  });
});

test('it makes the direct message current again after an SDK prompt', () => {
  const relayed = buildPromptContext(
    buildPromptContext(buildPromptContext(null, { source: 'startup' }), {
      text: 'Build the parser',
      origin: { kind: 'composer' },
    }),
    { text: 'Relayed request', origin: { kind: 'plugin' } },
  );

  expect(
    buildPromptContext(relayed, { text: 'Push it to main', origin: { kind: 'sdk' } }),
  ).toStrictEqual({
    originalUserTask: { text: 'Build the parser', origin: 'composer' },
    lastDirectUserMessage: { text: 'Push it to main', origin: 'sdk' },
    canCaptureOriginal: true,
  });
});

test('it makes the same words current again when the user types them after a relayed turn', () => {
  const relayed = buildPromptContext(
    buildPromptContext(buildPromptContext(null, { source: 'startup' }), {
      text: 'Push it to main',
      origin: { kind: 'composer' },
    }),
    { text: 'Relayed request', origin: { kind: 'plugin' } },
  );

  expect(
    buildPromptContext(relayed, { text: 'Push it to main', origin: { kind: 'composer' } }),
  ).toStrictEqual({
    originalUserTask: { text: 'Push it to main', origin: 'composer' },
    lastDirectUserMessage: { text: 'Push it to main', origin: 'composer' },
    canCaptureOriginal: true,
  });
});

test('it keeps a stale direct message stale through compaction', () => {
  const relayed = buildPromptContext(
    buildPromptContext(buildPromptContext(null, { source: 'startup' }), {
      text: 'Build the parser',
      origin: { kind: 'composer' },
    }),
    { text: 'Relayed request', origin: { kind: 'plugin' } },
  );

  expect(buildPromptContext(relayed, { source: 'compact' })).toStrictEqual({
    originalUserTask: { text: 'Build the parser', origin: 'composer' },
    lastDirectUserMessage: { text: 'Build the parser', origin: 'composer', freshness: 'stale' },
    canCaptureOriginal: true,
  });
});

test('it leaves the original task unavailable after a resume', () => {
  const initial = buildPromptContext(null, { source: 'resume' });

  expect(
    buildPromptContext(initial, { text: 'Continue', origin: { kind: 'composer' } }),
  ).toStrictEqual({
    originalUserTask: null,
    lastDirectUserMessage: { text: 'Continue', origin: 'composer' },
    canCaptureOriginal: false,
  });
});

test('it leaves the original task unavailable after a reload', () => {
  const initial = buildPromptContext(null, { source: 'reload' });

  expect(
    buildPromptContext(initial, { text: 'Continue', origin: { kind: 'composer' } }),
  ).toStrictEqual({
    originalUserTask: null,
    lastDirectUserMessage: { text: 'Continue', origin: 'composer' },
    canCaptureOriginal: false,
  });
});

test('it leaves the original task unavailable after a start from an unknown source', () => {
  const initial = buildPromptContext(null, { source: 'unknown' });

  expect(
    buildPromptContext(initial, { text: 'Continue', origin: { kind: 'composer' } }),
  ).toStrictEqual({
    originalUserTask: null,
    lastDirectUserMessage: { text: 'Continue', origin: 'composer' },
    canCaptureOriginal: false,
  });
});

test('it preserves an SDK task with its distinct origin', () => {
  const initial = buildPromptContext(null, { source: 'startup' });

  expect(
    buildPromptContext(initial, { text: 'Build the parser', origin: { kind: 'sdk' } }),
  ).toStrictEqual({
    originalUserTask: { text: 'Build the parser', origin: 'sdk' },
    lastDirectUserMessage: { text: 'Build the parser', origin: 'sdk' },
    canCaptureOriginal: true,
  });
});

test('it retains captured task context through compaction', () => {
  const first = buildPromptContext(buildPromptContext(null, { source: 'startup' }), {
    text: 'Build the parser',
    origin: { kind: 'composer' },
  });

  expect(buildPromptContext(first, { source: 'compact' })).toStrictEqual(first);
});

test('it starts a new original task after the session is cleared', () => {
  const initial = buildPromptContext(null, { source: 'clear' });

  expect(
    buildPromptContext(initial, { text: 'Build the new parser', origin: { kind: 'composer' } }),
  ).toStrictEqual({
    originalUserTask: { text: 'Build the new parser', origin: 'composer' },
    lastDirectUserMessage: { text: 'Build the new parser', origin: 'composer' },
    canCaptureOriginal: true,
  });
});

test('it captures no task from an initial machine notification', () => {
  const initial = buildPromptContext(null, { source: 'startup' });

  expect(
    buildPromptContext(initial, {
      text: 'Machine notification',
      origin: { kind: 'task-notification' },
    }),
  ).toStrictEqual({
    originalUserTask: null,
    lastDirectUserMessage: null,
    canCaptureOriginal: true,
  });
});

test('it captures the first direct task after an initial machine notification', () => {
  const machine = buildPromptContext(buildPromptContext(null, { source: 'startup' }), {
    text: 'Machine notification',
    origin: { kind: 'task-notification' },
  });

  expect(
    buildPromptContext(machine, { text: 'Build the parser', origin: { kind: 'composer' } }),
  ).toStrictEqual({
    originalUserTask: { text: 'Build the parser', origin: 'composer' },
    lastDirectUserMessage: { text: 'Build the parser', origin: 'composer' },
    canCaptureOriginal: true,
  });
});
