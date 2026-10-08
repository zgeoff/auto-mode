import type { MessagesResponse } from '../src/model/anthropic-client.ts';

// Answered in order, one per request; the preload empties it after each test.
export const messagesReplies: MessagesResponse[] = [];
