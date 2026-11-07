import { match } from 'ts-pattern';
import type { ProviderConfig } from '../config/config.ts';
import { pickJudgeLane } from '../config/pick-judge-lane.ts';
import type { JudgeLane } from '../config/pick-judge-lane.ts';
import type {
  JudgeEndpoint,
  JudgeMessageReply,
  JudgeSession,
  JudgeTarget,
  ModelRequest,
} from './types.ts';

export interface JudgeTransport {
  readonly apiKey: string | null;
  readonly env: Readonly<Record<string, string | undefined>>;

  readonly session?: JudgeSession | undefined;
}

export function sendJudgeMessage(
  provider: Readonly<ProviderConfig>,
  request: Readonly<ModelRequest>,
  transport: Readonly<JudgeTransport>,
  signal: Readonly<AbortSignal>,
): Promise<JudgeMessageReply> {
  return match(pickJudgeLane(provider))
    .with({ transport: 'refused' }, () =>
      Promise.reject(new Error('Jev returns typed answers and cannot write a judge reason')),
    )
    .with({ transport: 'agent-sdk' }, (lane) => {
      const endpoint = buildJudgeEndpoint(provider, lane, transport.apiKey);

      return endpoint === null
        ? Promise.reject(new Error('no API key for the judge'))
        : sendToAgentSDK({ model: provider.model, endpoint }, request, transport, signal);
    })
    .exhaustive();
}

function buildJudgeEndpoint(
  provider: Readonly<ProviderConfig>,
  lane: Readonly<JudgeLane>,
  apiKey: string | null,
): JudgeEndpoint | null {
  if (lane.credential === 'none') {
    return { kind: 'login' };
  }

  return apiKey === null
    ? null
    : {
        kind: 'api-key',
        baseURL: provider.baseURL,
        apiKey,

        // The configuration accepts any positive number, and Claude Code reads a whole count.
        maxTokens: Math.ceil(provider.maxTokens),
      };
}

async function sendToAgentSDK(
  target: Readonly<JudgeTarget>,
  request: Readonly<ModelRequest>,
  transport: Readonly<JudgeTransport>,
  signal: Readonly<AbortSignal>,
): Promise<JudgeMessageReply> {
  if (transport.session !== undefined) {
    return transport.session.review(target, request, signal);
  }

  const sessionModule = await import('./start-judge-session.ts');

  const session = sessionModule.startJudgeSession(transport.env);

  try {
    return await session.review(target, request, signal);
  } finally {
    session.stop();
  }
}
