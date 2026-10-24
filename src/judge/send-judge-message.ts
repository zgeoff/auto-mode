import type { ProviderConfig } from '../config/config.ts';
import { pickJudgeLane } from '../config/pick-judge-lane.ts';
import type { JudgeLane } from '../config/pick-judge-lane.ts';
import { sendMessage } from '../messages/anthropic-client.ts';
import type { ModelRequest } from '../messages/anthropic-client.ts';
import type { JudgeMessageReply, JudgeSession } from './types.ts';

export interface JudgeTransport {
  readonly apiKey: string | null;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly session?: JudgeSession | undefined;
}

type JudgeSender = (
  provider: Readonly<ProviderConfig>,
  request: Readonly<ModelRequest>,
  transport: Readonly<JudgeTransport>,
  signal: Readonly<AbortSignal>,
) => Promise<JudgeMessageReply>;

const JUDGE_SENDERS: Readonly<Record<JudgeLane['transport'], JudgeSender>> = {
  'agent-sdk': sendToAgentSDK,
  messages: sendToMessagesAPI,
  refused: () =>
    Promise.reject(new Error('Jev returns typed answers and cannot write a judge reason')),
};

export function sendJudgeMessage(
  provider: Readonly<ProviderConfig>,
  request: Readonly<ModelRequest>,
  transport: Readonly<JudgeTransport>,
  signal: Readonly<AbortSignal>,
): Promise<JudgeMessageReply> {
  return JUDGE_SENDERS[pickJudgeLane(provider).transport](provider, request, transport, signal);
}

async function sendToAgentSDK(
  provider: Readonly<ProviderConfig>,
  request: Readonly<ModelRequest>,
  transport: Readonly<JudgeTransport>,
  signal: Readonly<AbortSignal>,
): Promise<JudgeMessageReply> {
  if (transport.session !== undefined) {
    return transport.session.review(provider.model, request, signal);
  }

  const sessionModule = await import('./start-judge-session.ts');

  const session = sessionModule.startJudgeSession(transport.env);

  try {
    return await session.review(provider.model, request, signal);
  } finally {
    session.stop();
  }
}

async function sendToMessagesAPI(
  provider: Readonly<ProviderConfig>,
  request: Readonly<ModelRequest>,
  transport: Readonly<JudgeTransport>,
  signal: Readonly<AbortSignal>,
): Promise<JudgeMessageReply> {
  if (transport.apiKey === null) {
    throw new Error('no API key for the judge');
  }

  const result = await sendMessage(provider, transport.apiKey, request, signal);

  return {
    text: result.text,
    model: provider.model,
    safetyStops: null,
    fallback: false,
    warm: null,
  };
}
