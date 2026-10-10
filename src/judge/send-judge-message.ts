import type { ProviderConfig } from '../config/config.ts';
import { sendMessage } from '../model/anthropic-client.ts';
import type { ModelRequest } from '../model/anthropic-client.ts';
import { runClaudeCode } from './run-claude-code.ts';

export interface JudgeTransport {
  readonly apiKey: string | null;
  readonly env: Readonly<Record<string, string | undefined>>;
}

export async function sendJudgeMessage(
  provider: Readonly<ProviderConfig>,
  request: Readonly<ModelRequest>,
  transport: Readonly<JudgeTransport>,
  signal: Readonly<AbortSignal>,
): Promise<string> {
  if (provider.protocol === 'claude-code') {
    const reply = await runClaudeCode(provider, request, transport.env, signal);

    return reply.text;
  }

  if (provider.protocol === 'system-one') {
    throw new Error('Jev returns typed answers and cannot write a judge reason');
  }

  if (transport.apiKey === null) {
    throw new Error('no API key for the judge');
  }

  const result = await sendMessage(provider, transport.apiKey, request, signal);

  return result.text;
}
