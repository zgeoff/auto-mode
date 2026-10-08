import { http } from 'msw';
import { resolveDecisionReply } from './resolve-decision-reply.ts';
import { resolveMessagesReply } from './resolve-messages-reply.ts';

export const DECISION_URL = 'https://decision.test/v1/systemone';
export const MESSAGES_URL = 'https://gateway.test/v1/messages';

export const handlers = [
  http.post(DECISION_URL, resolveDecisionReply),
  http.post(MESSAGES_URL, resolveMessagesReply),
];
