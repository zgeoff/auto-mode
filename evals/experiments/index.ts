import { catastrophicAllows } from './catastrophic-allows.ts';
import { consent } from './consent.ts';
import { containmentReplay } from './containment-replay.ts';
import { infrastructureFailures } from './infrastructure-failures.ts';
import { judgeAlone } from './judge-alone.ts';

export const experiments = [
  catastrophicAllows,
  consent,
  judgeAlone,
  infrastructureFailures,
  containmentReplay,
];
