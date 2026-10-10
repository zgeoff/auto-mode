export { tryClassifyEdit } from './bypass/try-classify-edit.ts';
export type { EditClassification } from './bypass/classify-edit.ts';
export { classifyAction, type ActionOutcome, type ClassifyOptions } from './classify-action.ts';

export {
  resolveConfigPath,
  DEFAULT_CONFIG,
  loadConfig,
  PRESETS,
  resolveApiKey,
  type Config,
  type ProviderConfig,
  type ScopeSource,
} from './config/config.ts';

export { loadClaudeRules } from './config/load-claude-rules.ts';
export type { ClaudeRules } from './config/types.ts';
export { checkContainment, type ContainmentDeny } from './containment/check-containment.ts';
export type { OwnedScope } from './containment/collect-scope-findings.ts';
export { buildDecisionRequest } from './model/build-decision-request.ts';
export { classifyWithModel, type ModelOutcome } from './model/classify-with-model.ts';
export { DecisionRequestError } from './model/decision-request-error.ts';
export { parseModelVerdict } from './model/parse-verdict.ts';
export { sendDecision } from './model/send-decision.ts';

export type {
  DecisionRequest,
  DecisionResult,
  DecisionRule,
  RecordedDecisionChoice,
  RepositoryContext,
} from './model/types.ts';

export { loadPolicy, type PolicyPaths } from './policy/load-policy.ts';
export { parseActionRequest } from './request/parse-action-request.ts';
export { renderVerdict } from './request/render-verdict.ts';
export type { ActionRequest, DecisionContext, Verdict } from './request/types.ts';
export { classifyLocally, type LocalVerdict } from './rules/classify-locally.ts';
export { buildTaskScope } from './scope/build-task-scope.ts';
export type { ScopeEvent, SessionScope } from './scope/types.ts';
