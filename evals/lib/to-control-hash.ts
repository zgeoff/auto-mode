import type { DecisionRequest } from 'auto-mode/eval';
import { toHash } from './to-hash.ts';

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
