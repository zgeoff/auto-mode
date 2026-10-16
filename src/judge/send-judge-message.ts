import type { ProviderConfig } from '../config/config.ts';
import { sendMessage } from '../messages/anthropic-client.ts';
import type { ModelRequest } from '../messages/anthropic-client.ts';
import type { JudgeMessageReply, JudgeSession } from './types.ts';

export interface JudgeTransport {
  readonly apiKey: string | null;
  readonly env: Readonly<Record<string, string | undefined>>;

  // A caller that judges more than once holds a session, so its later reviews
  // reuse the judge process; without one, each review starts and stops its own.
  readonly session?: JudgeSession | undefined;
}

export async function sendJudgeMessage(
  provider: Readonly<ProviderConfig>,
  request: Readonly<ModelRequest>,
  transport: Readonly<JudgeTransport>,
  signal: Readonly<AbortSignal>,
): Promise<JudgeMessageReply> {
  if (provider.protocol === 'claude-code') {
    if (transport.session !== undefined) {
      return transport.session.review(provider.model, request, signal);
    }

    // The Agent SDK loads only for a review without a session, so a CLI run
    // that reaches a warm judge server never parses it.
    const sessionModule = await import('./start-judge-session.ts');

    const session = sessionModule.startJudgeSession(transport.env);

    try {
      return await session.review(provider.model, request, signal);
    } finally {
      session.stop();
    }
  }

  if (provider.protocol === 'system-one') {
    throw new Error('Jev returns typed answers and cannot write a judge reason');
  }

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
