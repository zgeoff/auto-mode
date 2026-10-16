import type { ProviderConfig } from '../config/config.ts';
import { sendMessage } from '../messages/anthropic-client.ts';
import type { ModelRequest } from '../messages/anthropic-client.ts';
import { runClaudeCode } from './run-claude-code.ts';

export interface JudgeTransport {
  readonly apiKey: string | null;
  readonly env: Readonly<Record<string, string | undefined>>;
}

// The model is the one that wrote the reply, which a claude -p fallback makes
// another model than the configured one.
export interface JudgeMessageReply {
  readonly text: string;
  readonly model: string;
  readonly safetyStops: number | null;
}

export async function sendJudgeMessage(
  provider: Readonly<ProviderConfig>,
  request: Readonly<ModelRequest>,
  transport: Readonly<JudgeTransport>,
  signal: Readonly<AbortSignal>,
): Promise<JudgeMessageReply> {
  if (provider.protocol === 'claude-code') {
    return runClaudeCode(provider, request, transport.env, signal);
  }

  if (provider.protocol === 'system-one') {
    throw new Error('Jev returns typed answers and cannot write a judge reason');
  }

  if (transport.apiKey === null) {
    throw new Error('no API key for the judge');
  }

  const result = await sendMessage(provider, transport.apiKey, request, signal);

  return { text: result.text, model: provider.model, safetyStops: null };
}
