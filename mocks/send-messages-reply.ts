import { HttpResponse } from 'msw';
import * as z from 'zod';
import type {
  MessagesErrorBody,
  MessagesRequest,
  MessagesResponse,
} from '../src/model/anthropic-client.ts';
import { messagesReplies } from './messages-replies.ts';

interface ResolverInfo {
  readonly request: Readonly<Pick<Request, 'json'>>;
}

const systemBlockSchema = z.strictObject({
  type: z.literal('text'),
  text: z.string(),
  cache_control: z.strictObject({ type: z.literal('ephemeral') }),
});

const messageSchema = z.strictObject({ role: z.literal('user'), content: z.string() });

// The Messages API refuses a field it does not know, so an unknown field fails here too.
const requestSchema = z.strictObject({
  model: z.string(),
  max_tokens: z.number().int().positive(),
  system: z.array(systemBlockSchema),
  messages: z.array(messageSchema).min(1),
}) satisfies z.ZodType<MessagesRequest>;

// No generated text is a safe default verdict, so a request that finds the
// queue empty fails loudly with the API's own error shape.
export async function sendMessagesReply(
  info: Readonly<ResolverInfo>,
): Promise<HttpResponse<MessagesResponse | MessagesErrorBody>> {
  const json: unknown = await info.request.json();

  const parsed = requestSchema.safeParse(json);

  if (!parsed.success) {
    // The API names an unknown field with this text in its published errors.
    const message = parsed.error.issues
      .flatMap((issue) =>
        issue.code === 'unrecognized_keys'
          ? issue.keys.map(
              (key) => `${[...issue.path, key].join('.')}: Extra inputs are not permitted`,
            )
          : [`${issue.path.join('.') || 'body'}: ${issue.message}`],
      )
      .join('; ');

    return HttpResponse.json<MessagesErrorBody>(
      { type: 'error', error: { type: 'invalid_request_error', message } },
      { status: 400 },
    );
  }

  const reply = messagesReplies.shift();

  if (reply === undefined) {
    return HttpResponse.json<MessagesErrorBody>(
      { type: 'error', error: { type: 'api_error', message: 'no Messages reply is queued' } },
      { status: 500 },
    );
  }

  return HttpResponse.json<MessagesResponse>(reply);
}
