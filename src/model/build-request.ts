import type { HookPayload } from '../harness/types.ts';
import type { TranscriptEntry } from '../transcript/read-transcript.ts';

const MAX_INPUT_CHARS = 4000;

export function buildUserMessage(
  payload: HookPayload,
  transcript: readonly TranscriptEntry[],
  reasoning: boolean,
): string {
  const history =
    transcript.length === 0
      ? '(no transcript available from this harness)'
      : transcript.map((entry) => `${entry.role}: ${entry.text}`).join('\n\n');

  const input = JSON.stringify(payload.toolInput, null, 2).slice(0, MAX_INPUT_CHARS);

  // A reasoning model is told to think first; a non-reasoning one is told to
  // answer with the tags and nothing else, because its whole output is the
  // answer and stray prose there breaks the parse.
  const closing = reasoning
    ? 'Work through the classification process, then end your reply with the output contract tags.'
    : 'Reply with the output contract tags and nothing else.';

  return `<transcript>
${history}
</transcript>

<action>
tool: ${payload.toolName}
cwd: ${payload.cwd}
input:
${input}
</action>

${closing}`;
}
