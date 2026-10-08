import { http } from 'msw';
import { sendDecisionReply } from './send-decision-reply.ts';
import { sendMessagesReply } from './send-messages-reply.ts';

export const DECISION_URL = 'https://decision.test/v1/systemone';
export const MESSAGES_URL = 'https://gateway.test/v1/messages';

export const handlers = [
  http.post(DECISION_URL, sendDecisionReply),
  http.post(MESSAGES_URL, sendMessagesReply),
];
