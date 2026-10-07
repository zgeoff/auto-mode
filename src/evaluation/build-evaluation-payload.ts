import type { ActionRequest } from '../request/types.ts';
import type { EvaluationCase } from './load-second-judge-corpus.ts';

export function buildEvaluationPayload(entry: EvaluationCase): ActionRequest {
  return {
    sessionID: 'second-judge-evaluation',
    cwd: entry.repositoryContext.cwd,
    toolName: entry.tool,
    toolInput: entry.input,
  };
}
