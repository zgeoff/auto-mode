import type { Config } from 'auto-mode';
import invariant from 'tiny-invariant';

export function assertShippedJevConfig(config: Readonly<Config>): void {
  invariant(
    config.provider.protocol === 'system-one' &&
      config.rulesPath === undefined &&
      config.classifierPath === undefined,
    'Evaluate the shipped Jev policy with no replacement policy.',
  );
}
