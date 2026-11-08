import { http } from 'msw';
import { sendDecisionReply } from './send-decision-reply.ts';

export const DECISION_URL = 'https://decision.test/v1/systemone';
export const handlers = [http.post(DECISION_URL, sendDecisionReply)];
