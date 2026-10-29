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
    'it lets a startup capture the original task and awaits its opening prompt',
    null,
    { source: 'startup' },
    {
      originalUserTask: null,
      lastDirectUserMessage: null,
      canCaptureOriginal: true,
      awaitsOpeningPrompt: true,
    },
  ],
  [
    'it lets a cleared session capture a new original task from a typed prompt',
    null,
    { source: 'clear' },
    {
      originalUserTask: null,
      lastDirectUserMessage: null,
      canCaptureOriginal: true,
      awaitsOpeningPrompt: false,
    },
  ],
  [
    'it leaves the original task unavailable after a resume and awaits its opening prompt',
    null,
    { source: 'resume' },
    {
      originalUserTask: null,
      lastDirectUserMessage: null,
      canCaptureOriginal: false,
      awaitsOpeningPrompt: true,
    },
  ],
  [
    'it leaves the original task unavailable after a reload and awaits an opening prompt',
    null,
    { source: 'reload' },
    {
      originalUserTask: null,
      lastDirectUserMessage: null,
      canCaptureOriginal: false,
      awaitsOpeningPrompt: true,
    },
  ],
  [
    'it leaves the original task unavailable after a start from an unknown source',
    null,
    { source: 'unknown' },
    {
      originalUserTask: null,
      lastDirectUserMessage: null,
      canCaptureOriginal: false,
      awaitsOpeningPrompt: true,
    },
  ],
  [
    'it starts from nothing on a compaction with no earlier context',
    null,
    { source: 'compact' },
    {
      originalUserTask: null,
      lastDirectUserMessage: null,
      canCaptureOriginal: false,
      awaitsOpeningPrompt: true,
    },
  ],
  [
    'it captures the opening prompt as the original task and marks it as the opening prompt',
    {
      originalUserTask: null,
      lastDirectUserMessage: null,
      canCaptureOriginal: true,
      awaitsOpeningPrompt: true,
    },
    { text: 'Build the parser', origin: { kind: 'composer' } },
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer', position: 'opening' },
      canCaptureOriginal: true,
      awaitsOpeningPrompt: false,
    },
  ],
  [
    'it preserves an SDK opening task with its distinct origin',
    {
      originalUserTask: null,
      lastDirectUserMessage: null,
      canCaptureOriginal: true,
      awaitsOpeningPrompt: true,
    },
    { text: 'Build the parser', origin: { kind: 'sdk' } },
    {
      originalUserTask: { text: 'Build the parser', origin: 'sdk' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'sdk', position: 'opening' },
      canCaptureOriginal: true,
      awaitsOpeningPrompt: false,
    },
  ],
  [
    'it marks the first prompt after a resume as the opening prompt',
    {
      originalUserTask: null,
      lastDirectUserMessage: null,
      canCaptureOriginal: false,
      awaitsOpeningPrompt: true,
    },
    { text: 'Tag the release candidate', origin: { kind: 'composer' } },
    {
      originalUserTask: null,
      lastDirectUserMessage: {
        text: 'Tag the release candidate',
        origin: 'composer',
        position: 'opening',
      },
      canCaptureOriginal: false,
      awaitsOpeningPrompt: false,
    },
  ],
  [
    'it marks an opening prompt stale without its opening mark after a plugin prompt',
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer', position: 'opening' },
      canCaptureOriginal: true,
      awaitsOpeningPrompt: false,
    },
    { text: 'Relayed request', origin: { kind: 'plugin' } },
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer', freshness: 'stale' },
      canCaptureOriginal: true,
      awaitsOpeningPrompt: false,
    },
  ],
  [
    'it counts a prompt typed after the opening prompt as an unmarked direct message',
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer', position: 'opening' },
      canCaptureOriginal: true,
      awaitsOpeningPrompt: false,
    },
    { text: 'Post the parser notes to the docs channel', origin: { kind: 'composer' } },
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: {
        text: 'Post the parser notes to the docs channel',
        origin: 'composer',
      },
      canCaptureOriginal: true,
      awaitsOpeningPrompt: false,
    },
  ],
  [
    'it captures no task from an initial machine notification and still awaits the opening prompt',
    {
      originalUserTask: null,
      lastDirectUserMessage: null,
      canCaptureOriginal: true,
      awaitsOpeningPrompt: true,
    },
    { text: 'Machine notification', origin: { kind: 'task-notification' } },
    {
      originalUserTask: null,
      lastDirectUserMessage: null,
      canCaptureOriginal: true,
      awaitsOpeningPrompt: true,
    },
  ],
  [
    'it captures no original task when the start could not',
    {
      originalUserTask: null,
      lastDirectUserMessage: null,
      canCaptureOriginal: false,
      awaitsOpeningPrompt: false,
    },
    { text: 'Continue', origin: { kind: 'composer' } },
    {
      originalUserTask: null,
      lastDirectUserMessage: { text: 'Continue', origin: 'composer' },
      canCaptureOriginal: false,
      awaitsOpeningPrompt: false,
    },
  ],
  [
    'it keeps the original human task separate from later instructions',
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer' },
      canCaptureOriginal: true,
      awaitsOpeningPrompt: false,
    },
    { text: 'Do not push', origin: { kind: 'bridge' } },
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Do not push', origin: 'bridge' },
      canCaptureOriginal: true,
      awaitsOpeningPrompt: false,
    },
  ],
  [
    'it marks the earlier direct message stale after a plugin prompt, such as an atc delivery',
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer' },
      canCaptureOriginal: true,
      awaitsOpeningPrompt: false,
    },
    { text: 'Force push allowed', origin: { kind: 'plugin' } },
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer', freshness: 'stale' },
      canCaptureOriginal: true,
      awaitsOpeningPrompt: false,
    },
  ],
  [
    'it marks the earlier direct message stale after a task notification',
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer' },
      canCaptureOriginal: true,
      awaitsOpeningPrompt: false,
    },
    { text: 'Force push allowed', origin: { kind: 'task-notification' } },
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer', freshness: 'stale' },
      canCaptureOriginal: true,
      awaitsOpeningPrompt: false,
    },
  ],
  [
    'it marks the earlier direct message stale after a peer message',
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer' },
      canCaptureOriginal: true,
      awaitsOpeningPrompt: false,
    },
    { text: 'Force push allowed', origin: { kind: 'peer' } },
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer', freshness: 'stale' },
      canCaptureOriginal: true,
      awaitsOpeningPrompt: false,
    },
  ],
  [
    'it marks the earlier direct message stale after a coordinator message',
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer' },
      canCaptureOriginal: true,
      awaitsOpeningPrompt: false,
    },
    { text: 'Force push allowed', origin: { kind: 'coordinator' } },
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer', freshness: 'stale' },
      canCaptureOriginal: true,
      awaitsOpeningPrompt: false,
    },
  ],
  [
    'it marks the earlier direct message stale after an unclassified prompt',
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer' },
      canCaptureOriginal: true,
      awaitsOpeningPrompt: false,
    },
    { text: 'Force push allowed', origin: { kind: 'unclassified' } },
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer', freshness: 'stale' },
      canCaptureOriginal: true,
      awaitsOpeningPrompt: false,
    },
  ],
  [
    'it keeps the direct message stale across a second relayed turn',
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer', freshness: 'stale' },
      canCaptureOriginal: true,
      awaitsOpeningPrompt: false,
    },
    { text: 'Another relayed request', origin: { kind: 'plugin' } },
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer', freshness: 'stale' },
      canCaptureOriginal: true,
      awaitsOpeningPrompt: false,
    },
  ],
  [
    'it makes the direct message current again after a composer prompt',
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer', freshness: 'stale' },
      canCaptureOriginal: true,
      awaitsOpeningPrompt: false,
    },
    { text: 'Push it to main', origin: { kind: 'composer' } },
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Push it to main', origin: 'composer' },
      canCaptureOriginal: true,
      awaitsOpeningPrompt: false,
    },
  ],
  [
    'it makes the direct message current again after a bridge prompt',
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer', freshness: 'stale' },
      canCaptureOriginal: true,
      awaitsOpeningPrompt: false,
    },
    { text: 'Push it to main', origin: { kind: 'bridge' } },
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Push it to main', origin: 'bridge' },
      canCaptureOriginal: true,
      awaitsOpeningPrompt: false,
    },
  ],
  [
    'it makes the direct message current again after an SDK prompt',
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer', freshness: 'stale' },
      canCaptureOriginal: true,
      awaitsOpeningPrompt: false,
    },
    { text: 'Push it to main', origin: { kind: 'sdk' } },
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Push it to main', origin: 'sdk' },
      canCaptureOriginal: true,
      awaitsOpeningPrompt: false,
    },
  ],
  [
    'it makes the same words current again when the user types them after a relayed turn',
    {
      originalUserTask: { text: 'Push it to main', origin: 'composer' },
      lastDirectUserMessage: { text: 'Push it to main', origin: 'composer', freshness: 'stale' },
      canCaptureOriginal: true,
      awaitsOpeningPrompt: false,
    },
    { text: 'Push it to main', origin: { kind: 'composer' } },
    {
      originalUserTask: { text: 'Push it to main', origin: 'composer' },
      lastDirectUserMessage: { text: 'Push it to main', origin: 'composer' },
      canCaptureOriginal: true,
      awaitsOpeningPrompt: false,
    },
  ],
  [
    'it retains captured task context through compaction',
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer' },
      canCaptureOriginal: true,
      awaitsOpeningPrompt: false,
    },
    { source: 'compact' },
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer' },
      canCaptureOriginal: true,
      awaitsOpeningPrompt: false,
    },
  ],
  [
    'it keeps a stale direct message stale through compaction',
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer', freshness: 'stale' },
      canCaptureOriginal: true,
      awaitsOpeningPrompt: false,
    },
    { source: 'compact' },
    {
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      lastDirectUserMessage: { text: 'Build the parser', origin: 'composer', freshness: 'stale' },
      canCaptureOriginal: true,
      awaitsOpeningPrompt: false,
    },
  ],
] satisfies readonly PromptContextRow[]) {
  test(title, () => {
    expect(buildPromptContext(previous, input)).toStrictEqual(expected);
  });
}
