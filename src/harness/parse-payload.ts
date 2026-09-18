// zod's .catch() is a schema fallback, not a promise handler; both rules below match the method name alone
// oxlint-disable promise/prefer-await-to-then
// oxlint-disable unicorn/prefer-top-level-await
import * as z from 'zod';
import { detectHarness } from './detect-harness.ts';
import type { HookPayload } from './types.ts';

// Loose on purpose: a harness sends fields this shape does not name, and may
// send one it does name with the wrong type. Anything that does not fit is
// dropped; the payload is refused only when a tool call cannot be identified.
const payloadSchema = z.looseObject({
  hook_event_name: z.enum(['PreToolUse', 'PermissionRequest']),
  tool_name: z.string().min(1),
  tool_input: z.looseObject({}).catch({}),
  session_id: z.string().catch(''),
  cwd: z.string().min(1).optional().catch(undefined),
  transcript_path: z.string().min(1).optional().catch(undefined),
});

export function parsePayload(body: unknown): HookPayload | null {
  const envelope = z.looseObject({}).safeParse(body);

  if (!envelope.success) {
    return null;
  }

  const harness = detectHarness(envelope.data);

  if (harness === null) {
    return null;
  }

  const parsed = payloadSchema.safeParse(body);

  if (!parsed.success) {
    return null;
  }

  return {
    harness,
    event: parsed.data.hook_event_name,
    sessionId: parsed.data.session_id,
    cwd: parsed.data.cwd ?? process.cwd(),
    toolName: parsed.data.tool_name,
    toolInput: parsed.data.tool_input,

    // Muse sends null here on every event, so a missing path is normal and not
    // a reason to refuse the payload.
    transcriptPath: parsed.data.transcript_path,
    raw: envelope.data,
  };
}
