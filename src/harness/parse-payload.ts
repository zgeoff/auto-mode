import { detectHarness } from './detect-harness.ts';
import type { HookEvent, HookPayload } from './types.ts';

const EVENTS = new Set<string>(['PreToolUse', 'PermissionRequest']);

function readString(payload: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = payload[key];

  return typeof value === 'string' && value !== '' ? value : undefined;
}

export function parsePayload(body: unknown): HookPayload | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }

  const payload = body as Readonly<Record<string, unknown>>;
  const harness = detectHarness(payload);

  if (harness === null) {
    return null;
  }

  const event = readString(payload, 'hook_event_name');

  if (event === undefined || !EVENTS.has(event)) {
    return null;
  }

  const toolName = readString(payload, 'tool_name');

  if (toolName === undefined) {
    return null;
  }

  const toolInput = payload['tool_input'];
  const transcriptPath = readString(payload, 'transcript_path');

  return {
    harness,
    event: event as HookEvent,
    sessionId: readString(payload, 'session_id') ?? '',
    cwd: readString(payload, 'cwd') ?? process.cwd(),
    toolName,
    toolInput:
      toolInput !== null && typeof toolInput === 'object' && !Array.isArray(toolInput)
        ? (toolInput as Readonly<Record<string, unknown>>)
        : {},

    // Muse sends null here on every event, so a missing path is normal and not
    // a reason to refuse the payload.
    ...(transcriptPath === undefined ? {} : { transcriptPath }),
    raw: payload,
  };
}
