import type { Config } from 'auto-mode';
import { DEFAULT_BLOCK_THRESHOLD } from 'auto-mode/eval';

export function resolveBlockThreshold(config: Readonly<Pick<Config, 'blockThreshold'>>): number {
  return config.blockThreshold ?? DEFAULT_BLOCK_THRESHOLD;
}
