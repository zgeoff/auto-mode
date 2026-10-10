import type { DecisionRequest } from 'auto-mode';
import { toHash } from './to-hash.ts';

// The hash leaves out the last direct user message, and the marked guidance
// suffix when one is named, so two arms of one action hash the same.
export function toControlHash(request: DecisionRequest, markGuidance?: string): string {
  const taskContext = request.state.taskContext;
  const guidance = request.state.answerGuidance;
  const suffix = markGuidance === undefined ? null : ` ${markGuidance}`;

  return toHash(
    JSON.stringify({
      ...request,
      state: {
        ...request.state,
        answerGuidance:
          suffix !== null && guidance.endsWith(suffix)
            ? guidance.slice(0, -suffix.length)
            : guidance,
        lastUserMessage: null,
        ...(taskContext === undefined
          ? {}
          : { taskContext: { ...taskContext, lastDirectUserMessage: null } }),
      },
    }),
  );
}
