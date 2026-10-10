import { checkCwdContainment } from './check-cwd-containment.ts';
import type { Stage } from './define-experiment.ts';
import type { MeasurementCase } from './load-measurement-sets.ts';

export const CONTAINMENT_STAGE = 'containment';

// The containment check in the cwd scope: deterministic, so a recorded run and
// a live run both run it.
export function buildContainmentStage(): Stage<MeasurementCase> {
  return {
    name: CONTAINMENT_STAGE,
    sends: false,
    run: async (entry) => {
      const deny = await checkCwdContainment(
        {
          tool: entry.case.action.toolName,
          input: entry.case.action.toolInput,
          cwd: entry.case.action.cwd,
        },
        entry.case.repository,
      );

      return deny === null
        ? { status: 'scored', verdict: 'allow', pBlock: null, reason: null }
        : { status: 'scored', verdict: 'deny', pBlock: null, reason: deny.reason };
    },
  };
}
