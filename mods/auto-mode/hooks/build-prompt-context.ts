import { isMessageOrigin } from '../contract/is-message-origin.ts';
import type { DirectUserMessage, UserTask } from '../contract/types.ts';
import type { PromptContext } from './types.ts';

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

      // A launcher can pass the opening prompt on the command line, which
      // Claude Code reports with the origin of a typed prompt. A clear happens
      // only at the prompt of a running session.
      awaitsOpeningPrompt: input.source !== 'clear',
    };
  }

  const origin = input.origin.kind;

  if (!isMessageOrigin(origin)) {
    return {
      originalUserTask: previous?.originalUserTask ?? null,
      lastDirectUserMessage: buildStaleMessage(previous?.lastDirectUserMessage ?? null),
      canCaptureOriginal: previous?.canCaptureOriginal ?? false,
      awaitsOpeningPrompt: previous?.awaitsOpeningPrompt ?? true,
    };
  }

  const message: UserTask = { text: input.text, origin };
  const isOpeningPrompt = previous?.awaitsOpeningPrompt ?? true;

  return {
    originalUserTask:
      previous?.originalUserTask ?? (previous?.canCaptureOriginal === true ? message : null),
    lastDirectUserMessage: isOpeningPrompt ? { ...message, position: 'opening' } : message,
    canCaptureOriginal: previous?.canCaptureOriginal ?? false,
    awaitsOpeningPrompt: false,
  };
}

function buildStaleMessage(message: DirectUserMessage | null): DirectUserMessage | null {
  return message === null
    ? null
    : {
        text: message.text,
        origin: message.origin,
        freshness: 'stale',
        ...(message.position === undefined ? {} : { position: message.position }),
      };
}
