import type { SessionContext } from '../../types.ts';

// A plugin test loads only the plugin's own files, so faker is out of reach and
// the arbitrary fields take fixed defaults.
export function buildMockSessionContext(overrides: Partial<SessionContext> = {}): SessionContext {
  return {
    cwd: '/repo',
    session_id: 'session-1',
    transcript_path: '/repo/transcript.jsonl',
    ...overrides,
  };
}
