import { CLI_LIMITS } from '../../mods/auto-mode/contract/cli-limits.ts';
import type { Config } from './config.ts';

export function buildJevOnlyConfig(config: Config): Config {
  // The mod stops the run at the sum of these limits, so a longer configured
  // judge would leave the second judge call no time.
  const judge =
    config.judge === undefined || config.judge === null
      ? config.judge
      : { ...config.judge, timeoutMs: Math.min(config.judge.timeoutMs, CLI_LIMITS.judgeMs) };

  return {
    ...config,
    provider: {
      ...config.provider,
      timeoutMs: Math.min(config.provider.timeoutMs, CLI_LIMITS.jevMs),
    },
    ...(judge === undefined ? {} : { judge }),
  };
}
