import type { DirectUserMessage, PromptContext, UserTask } from './types.ts';

export function buildPromptContext(
  previous: PromptContext | null,
  input:
    | { readonly source: string }
    | { readonly text: string; readonly origin: { readonly kind: string } },
): PromptContext {
  if ('source' in input) {
    if (input.source === 'compact' && previous !== null) {
      return previous;
    }

    return {
      originalUserTask: null,
      lastDirectUserMessage: null,
      canCaptureOriginal: input.source === 'startup' || input.source === 'clear',
    };
  }

  const origin = input.origin.kind;

  if (origin !== 'composer' && origin !== 'bridge' && origin !== 'sdk') {
    return {
      originalUserTask: previous?.originalUserTask ?? null,
      lastDirectUserMessage: buildStaleMessage(previous?.lastDirectUserMessage ?? null),
      canCaptureOriginal: previous?.canCaptureOriginal ?? false,
    };
  }

  const message: UserTask = { text: input.text, origin };

  return {
    originalUserTask:
      previous?.originalUserTask ?? (previous?.canCaptureOriginal === true ? message : null),
    lastDirectUserMessage: message,
    canCaptureOriginal: previous?.canCaptureOriginal ?? false,
  };
}

function buildStaleMessage(message: DirectUserMessage | null): DirectUserMessage | null {
  return message === null
    ? null
    : { text: message.text, origin: message.origin, freshness: 'stale' };
}
