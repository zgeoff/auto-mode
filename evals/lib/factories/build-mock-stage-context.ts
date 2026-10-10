import type { StageContext } from '../define-experiment.ts';

// Each sender rejects, so a stage that sends where the test expected none fails
// loudly; a test that sends passes the sender its scenario answers with.
export function buildMockStageContext(overrides: Partial<StageContext> = {}): StageContext {
  return {
    seed: 1,
    sample: 0,
    offline: true,
    policy: 'policy',
    configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
    previous: [],
    send: () => Promise.reject(new Error('The stage sent a Jev request.')),
    sendWithChoices: () => Promise.reject(new Error('The stage sent a categorical request.')),
    sendJudge: () => Promise.reject(new Error('The stage sent a judge request.')),
    ...overrides,
  };
}
