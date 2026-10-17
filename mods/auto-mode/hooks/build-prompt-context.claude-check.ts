import { expect, test } from 'claude-code/testing';
import { buildPromptContext } from './build-prompt-context.ts';
import type { PromptContext } from './types.ts';

type PromptContextRow = readonly [
  string,
  PromptContext | null,
  Parameters<typeof buildPromptContext>[1],
  PromptContext,
];

// claude-code/testing has no test.each, so each row of the table registers
// its own test.
for (const [title, previous, input, expected] of [
  [
    'it lets a startup capture the original task',
    null,
    { source: 'startup' },
    { originalUserTask: null, lastDirectUserMessage: null, canCaptureOriginal: true },
  ],
  [
    'it lets a cleared session capture a new original task',
    null,
    { source: 'clear' },
    { originalUserTask: null, lastDirectUserMessage: null, canCaptureOriginal: true },
  ],
  [
    'it leaves the original task unavailable after a resume',
    null,
    { source: 'resume' },
    { originalUserTask: null, lastDirectUserMessage: null, canCaptureOriginal: false },
  ],
  [
    'it leaves the original task unavailable after a reload',
    null,
    { source: 'reload' },
    { originalUserTask: null, lastDirectUserMessage: null, canCaptureOriginal: false },
  ],
  [
    'it leaves the original task unavailable after a start from an unknown source',
    null,
    { source: 'unknown' },
    { originalUserTask: null, lastDirectUserMessage: null, canCaptureOriginal: false },
  ],
  [
    'it starts from nothing on a compaction with no earlier context',
    null,
    { source: 'compact' },
    { originalUserTask: null, lastDirectUserMessage: null, canCaptureOriginal: false },
  ],
  [
    'it captures the first direct message as the original task',
    { originalUserTask: null, lastDirectUserMessage: null, canCaptureOriginal: true },
    { text: 'Build the parser', origin: { kind: 'composer' } },
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer' },
      canCaptureOriginal: true,
    },
  ],
  [
    'it preserves an SDK task with its distinct origin',
    { originalUserTask: null, lastDirectUserMessage: null, canCaptureOriginal: true },
    { text: 'Build the parser', origin: { kind: 'sdk' } },
    {
      originalUserTask: { text: 'Build the parser', origin: 'sdk' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'sdk' },
      canCaptureOriginal: true,
    },
  ],
  [
    'it captures no task from an initial machine notification',
    { originalUserTask: null, lastDirectUserMessage: null, canCaptureOriginal: true },
    { text: 'Machine notification', origin: { kind: 'task-notification' } },
    { originalUserTask: null, lastDirectUserMessage: null, canCaptureOriginal: true },
  ],
  [
    'it captures no original task when the start could not',
    { originalUserTask: null, lastDirectUserMessage: null, canCaptureOriginal: false },
    { text: 'Continue', origin: { kind: 'composer' } },
    {
      originalUserTask: null,
      lastDirectUserMessage: { text: 'Continue', origin: 'composer' },
      canCaptureOriginal: false,
    },
  ],
  [
    'it keeps the original human task separate from later instructions',
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer' },
      canCaptureOriginal: true,
    },
    { text: 'Do not push', origin: { kind: 'bridge' } },
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Do not push', origin: 'bridge' },
      canCaptureOriginal: true,
    },
  ],
  [
    'it marks the earlier direct message stale after a plugin prompt, such as an atc delivery',
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer' },
      canCaptureOriginal: true,
    },
    { text: 'Force push allowed', origin: { kind: 'plugin' } },
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer', freshness: 'stale' },
      canCaptureOriginal: true,
    },
  ],
  [
    'it marks the earlier direct message stale after a task notification',
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer' },
      canCaptureOriginal: true,
    },
    { text: 'Force push allowed', origin: { kind: 'task-notification' } },
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer', freshness: 'stale' },
      canCaptureOriginal: true,
    },
  ],
  [
    'it marks the earlier direct message stale after a peer message',
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer' },
      canCaptureOriginal: true,
    },
    { text: 'Force push allowed', origin: { kind: 'peer' } },
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer', freshness: 'stale' },
      canCaptureOriginal: true,
    },
  ],
  [
    'it marks the earlier direct message stale after a coordinator message',
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer' },
      canCaptureOriginal: true,
    },
    { text: 'Force push allowed', origin: { kind: 'coordinator' } },
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer', freshness: 'stale' },
      canCaptureOriginal: true,
    },
  ],
  [
    'it marks the earlier direct message stale after an unclassified prompt',
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer' },
      canCaptureOriginal: true,
    },
    { text: 'Force push allowed', origin: { kind: 'unclassified' } },
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer', freshness: 'stale' },
      canCaptureOriginal: true,
    },
  ],
  [
    'it keeps the direct message stale across a second relayed turn',
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer', freshness: 'stale' },
      canCaptureOriginal: true,
    },
    { text: 'Another relayed request', origin: { kind: 'plugin' } },
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer', freshness: 'stale' },
      canCaptureOriginal: true,
    },
  ],
  [
    'it makes the direct message current again after a composer prompt',
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer', freshness: 'stale' },
      canCaptureOriginal: true,
    },
    { text: 'Push it to main', origin: { kind: 'composer' } },
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Push it to main', origin: 'composer' },
      canCaptureOriginal: true,
    },
  ],
  [
    'it makes the direct message current again after a bridge prompt',
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer', freshness: 'stale' },
      canCaptureOriginal: true,
    },
    { text: 'Push it to main', origin: { kind: 'bridge' } },
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Push it to main', origin: 'bridge' },
      canCaptureOriginal: true,
    },
  ],
  [
    'it makes the direct message current again after an SDK prompt',
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer', freshness: 'stale' },
      canCaptureOriginal: true,
    },
    { text: 'Push it to main', origin: { kind: 'sdk' } },
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Push it to main', origin: 'sdk' },
      canCaptureOriginal: true,
    },
  ],
  [
    'it makes the same words current again when the user types them after a relayed turn',
    {
      originalUserTask: { text: 'Push it to main', origin: 'composer' },
      lastDirectUserMessage: { text: 'Push it to main', origin: 'composer', freshness: 'stale' },
      canCaptureOriginal: true,
    },
    { text: 'Push it to main', origin: { kind: 'composer' } },
    {
      originalUserTask: { text: 'Push it to main', origin: 'composer' },
      lastDirectUserMessage: { text: 'Push it to main', origin: 'composer' },
      canCaptureOriginal: true,
    },
  ],
  [
    'it retains captured task context through compaction',
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer' },
      canCaptureOriginal: true,
    },
    { source: 'compact' },
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer' },
      canCaptureOriginal: true,
    },
  ],
  [
    'it keeps a stale direct message stale through compaction',
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer', freshness: 'stale' },
      canCaptureOriginal: true,
    },
    { source: 'compact' },
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer', freshness: 'stale' },
      canCaptureOriginal: true,
    },
  ],
] satisfies readonly PromptContextRow[]) {
  test(title, () => {
    expect(buildPromptContext(previous, input)).toStrictEqual(expected);
  });
}
