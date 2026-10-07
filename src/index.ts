export { classifyAction, type ActionOutcome, type ClassifyOptions } from './classify-action.ts';

export {
  resolveConfigPath,
  DEFAULT_CONFIG,
  loadConfig,
  PRESETS,
  resolveApiKey,
  type Config,
  type ProviderConfig,
} from './config/config.ts';

export { classifyWithModel, type ModelOutcome } from './model/classify-with-model.ts';
export { parseModelVerdict } from './model/parse-verdict.ts';
export { loadPolicy, type PolicyPaths } from './policy/load-policy.ts';
export { parseActionRequest } from './request/parse-action-request.ts';
export { renderVerdict } from './request/render-verdict.ts';
export type { ActionRequest, DecisionContext, Verdict } from './request/types.ts';
export { classifyLocally, type LocalVerdict } from './rules/classify-locally.ts';
