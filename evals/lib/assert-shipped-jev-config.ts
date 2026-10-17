import type { Config } from 'auto-mode';
import { pickClassifierLane } from 'auto-mode/eval';
import invariant from 'tiny-invariant';

export function assertShippedJevConfig(config: Readonly<Config>): void {
  invariant(
    pickClassifierLane(config.provider).kind === 'jev' &&
      config.rulesPath === undefined &&
      config.classifierPath === undefined,
    'Evaluate the shipped Jev policy with no replacement policy.',
  );
}
