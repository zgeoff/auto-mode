import type { HookPayload } from '../harness/types.ts';
import type { EvaluationCase } from './load-second-judge-corpus.ts';

export function buildEvaluationPayload(entry: EvaluationCase): HookPayload {
  return {
    harness: 'claude',
    event: 'PermissionRequest',
    sessionId: 'second-judge-evaluation',
    cwd: entry.repositoryContext.cwd,
    toolName: entry.tool,
    toolInput: entry.input,
    raw: {},
  };
}
