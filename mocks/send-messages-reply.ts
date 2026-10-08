import { HttpResponse } from 'msw';
import type { MessagesResponse } from '../src/model/anthropic-client.ts';
import { messagesReplies } from './messages-replies.ts';

interface MessagesError {
  readonly type: 'error';
  readonly error: { readonly type: 'api_error'; readonly message: string };
}

// No generated text is a safe default verdict, so a request that finds the
// queue empty fails loudly with the API's own error shape.
export function sendMessagesReply(): HttpResponse<MessagesResponse | MessagesError> {
  const reply = messagesReplies.shift();

  if (reply === undefined) {
    return HttpResponse.json<MessagesError>(
      { type: 'error', error: { type: 'api_error', message: 'no Messages reply is queued' } },
      { status: 500 },
    );
  }

  return HttpResponse.json<MessagesResponse>(reply);
}
