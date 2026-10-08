import type { Config } from '../../src/config/config.ts';
import { buildMockProviderConfig } from './build-mock-provider-config.ts';

type ProviderOverrides = Parameters<typeof buildMockProviderConfig>[0];

interface ConfigOverrides extends Partial<Omit<Config, 'provider' | 'judge' | 'denialBudget'>> {
  readonly provider?: ProviderOverrides;
  readonly judge?: ProviderOverrides | null;
  readonly denialBudget?: Partial<NonNullable<Config['denialBudget']>>;
}

// Configuration steers every decision, so each field takes the shipped default
// except the Claude settings path: left unset it reads the operator's real
// ~/.claude/settings.json.
export function buildMockConfig(overrides: ConfigOverrides = {}): Config {
  const { provider, judge, denialBudget, ...rest } = overrides;

  return {
    scopeSources: { cwd: { kind: 'cwd' }, session: { kind: 'session' }, atc: { kind: 'atc' } },
    classifierPath: undefined,
    rulesPath: undefined,
    onFailure: 'defer',
    claudeSettingsPath: null,
    minConfidence: 0.8,
    warnings: [],
    ...rest,
    provider: buildMockProviderConfig(provider),
    judge: judge === undefined || judge === null ? null : buildMockProviderConfig(judge),
    denialBudget: { consecutive: 3, perSession: 20, ...denialBudget },
  };
}
