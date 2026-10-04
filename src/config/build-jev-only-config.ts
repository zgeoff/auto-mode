import type { Config } from './config.ts';

export function buildJevOnlyConfig(config: Config): Config | null {
  if (config.provider.protocol !== 'system-one') {
    return null;
  }

  return {
    ...config,
    provider: { ...config.provider, timeoutMs: Math.min(config.provider.timeoutMs, 5000) },
  };
}
