import type { ContainmentDeny } from 'auto-mode/eval';
import { checkCwdContainment } from './check-cwd-containment.ts';
import type { Stage } from './define-experiment.ts';
import type { MeasurementCase } from './load-measurement-sets.ts';

export const CONTAINMENT_STAGE = 'containment';

export function buildContainmentStage(): Stage<MeasurementCase> {
  const denies = new WeakMap<MeasurementCase, Promise<ContainmentDeny | null>>();

  return {
    name: CONTAINMENT_STAGE,
    sends: false,
    run: async (entry) => {
      const checked =
        denies.get(entry.case) ??
        checkCwdContainment(
          {
            tool: entry.case.action.toolName,
            input: entry.case.action.toolInput,
            cwd: entry.case.action.cwd,
          },
          entry.case.repository,
        );

      denies.set(entry.case, checked);

      const deny = await checked;

      return deny === null
        ? { status: 'scored', verdict: 'allow', pBlock: null, reason: null }
        : { status: 'scored', verdict: 'deny', pBlock: null, reason: deny.reason };
    },
  };
}
