const KEY_COMMAND_MS = 5000;
const JEV_MS = 5000;
const JUDGE_MS = 120_000;
const STARTUP_MS = 5000;

export const CLI_LIMITS = {
  keyCommandMs: KEY_COMMAND_MS,
  jevMs: JEV_MS,
  judgeMs: JUDGE_MS,
  evaluationMs: STARTUP_MS + 3 * KEY_COMMAND_MS + JEV_MS + 2 * JUDGE_MS,
} as const;
