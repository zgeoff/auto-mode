import { findCurrentDirectUserMessage } from '../../mods/auto-mode/contract/find-current-direct-user-message.ts';
import type { Config } from '../config/config.ts';
import { DEFAULT_BLOCK_THRESHOLD, resolveApiKey } from '../config/config.ts';
import { createDeadlineSignal } from '../config/create-deadline-signal.ts';
import { loadClaudeSettings } from '../config/load-claude-settings.ts';
import { pickClassifierLane } from '../config/pick-classifier-lane.ts';
import { buildRepositoryEvidence } from '../git/build-repository-evidence.ts';
import { loadCheckoutFacts } from '../git/load-checkout-facts.ts';
import { loadMCPServers } from '../git/load-mcp-servers.ts';
import { loadPolicy } from '../policy/load-policy.ts';
import type { ActionRequest } from '../request/types.ts';
import { buildDecisionRequest } from './build-decision-request.ts';
import { buildJevOutcome } from './build-jev-outcome.ts';
import { sendDecision } from './send-decision.ts';
import type { DecisionDiagnostics, ModelOptions, ModelOutcome } from './types.ts';

export async function classifyWithJev(
  payload: ActionRequest,
  config: Config,
  options: Readonly<ModelOptions>,
): Promise<ModelOutcome> {
  const start = performance.now();
  const runtime = options.runtime;
  const host = runtime.host;
  let key: string | null = null;
  let stage: DecisionDiagnostics['stage'] = 'credential';
  const blockThreshold = config.blockThreshold ?? DEFAULT_BLOCK_THRESHOLD;
  let keySource: DecisionDiagnostics['keySource'] = 'none';

  const envKey =
    config.provider.apiKeyEnv === undefined ? undefined : host.env[config.provider.apiKeyEnv];

  if (envKey !== undefined && envKey !== '') {
    keySource = 'environment';
  } else if (config.provider.apiKeyCommand !== undefined && config.provider.apiKeyCommand !== '') {
    keySource = 'command';
  }

  try {
    // A library caller builds its own config, which the config file's check
    // never sees, so the classifier refuses a kind that only judges.
    const lane = pickClassifierLane(config.provider);

    if (lane.kind === 'refused') {
      throw new Error(`${lane.protocol} kinds only judge`);
    }

    key = await resolveApiKey(config.provider, options);

    if (key === null) {
      throw new Error('no API key: set the configured environment variable or key command');
    }

    stage = 'evidence';

    const directUserText = findCurrentDirectUserMessage(
      payload.decisionContext?.lastDirectUserMessage,
    );

    const settings = await (options.claudeSettings ??
      loadClaudeSettings(config.claudeSettingsPath, host));

    const checkout = await (options.checkout ??
      loadCheckoutFacts(payload.cwd, host.env, {
        findCheckout: options.findCheckout,
      }).catch(() => null));

    const repositoryContext =
      checkout === null ? null : buildRepositoryEvidence(checkout, options.taskScope);

    const [policy, mcpServers] = await Promise.all([
      loadPolicy(
        { classifierPath: config.classifierPath, rulesPath: config.rulesPath },
        'decision.md',
      ),
      loadMCPServers(payload.cwd, host, settings.userSettings, checkout ?? undefined).catch(
        () => [],
      ),
    ]);

    const rulesSource = config.rulesPath === undefined ? 'shipped' : 'replacement';

    const request = buildDecisionRequest(payload, policy, {
      configuredRules: settings.rules,
      lastUserMessage: directUserText,
      rulesSource,
      repositoryContext,
      mcpServers,
    });

    const signal = createDeadlineSignal(config.provider.timeoutMs, options);

    if (signal === null) {
      throw new DOMException('Evaluation deadline expired', 'AbortError');
    }

    stage = 'request';

    const result = await sendDecision(config.provider, key, request, {
      signal,
      fetch: runtime.fetch,
    });

    stage = 'response';

    return buildJevOutcome(
      { kind: 'reply', request, result, repositoryContext },
      { key, keySource, elapsedMs: performance.now() - start, blockThreshold },
      config,
    );
  } catch (error) {
    return buildJevOutcome(
      {
        kind: 'failure',
        error,
        stage,
        cancelled: options.signal?.aborted === true,
        deadlineExpired: options.deadlineAt !== undefined && runtime.now() >= options.deadlineAt,
      },
      { key, keySource, elapsedMs: performance.now() - start, blockThreshold },
      config,
    );
  }
}
