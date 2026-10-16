const KEY_COMMAND_MS = 5000;
const JEV_MS = 5000;
const JUDGE_MS = 120_000;

// Node start, the config and scope reads, and the action log, none of which
// waits on the network.
const STARTUP_MS = 5000;

// The CLI stops each step of one `run` at its limit. The worst case runs the
// key command, Jev, and the judge twice: once on a containment deny the user
// named, once on Jev's deny.
export const CLI_LIMITS = {
  keyCommandMs: KEY_COMMAND_MS,
  jevMs: JEV_MS,
  judgeMs: JUDGE_MS,
  evaluationMs: STARTUP_MS + KEY_COMMAND_MS + JEV_MS + 2 * JUDGE_MS,
} as const;
