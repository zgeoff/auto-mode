import type { PromptContext, UserTask } from './types.ts';

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
      hasPrompt: false,
      canCaptureOriginal: input.source === 'startup' || input.source === 'clear',
    };
  }

  const origin = input.origin.kind;

  const lastDirectUserMessage: UserTask | null =
    origin === 'composer' || origin === 'bridge' || origin === 'sdk'
      ? { text: input.text, origin }
      : null;

  return {
    originalUserTask:
      previous?.hasPrompt !== true && previous?.canCaptureOriginal === true
        ? lastDirectUserMessage
        : (previous?.originalUserTask ?? null),
    lastDirectUserMessage,
    hasPrompt: true,
    canCaptureOriginal: previous?.canCaptureOriginal ?? false,
  };
}
