import { afterAll, afterEach, beforeAll } from 'bun:test';
import { faker } from '@faker-js/faker';
import { decisionAnswers } from './mocks/decision-answers.ts';
import { messagesReplies } from './mocks/messages-replies.ts';
import { server } from './mocks/node.ts';

// A git hook exports the GIT_* names and an atc session the ATC_* ones. This
// clears them for in-process reads and node:child_process children only: a
// Bun.spawn or Bun.$ child still gets the startup environment.
for (const name of [
  'ATC_SESSION_RECORD',
  'ATC_SESSION_ID',
  'ATC_SOCKET',
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_COMMON_DIR',
  'GIT_INDEX_FILE',
  'GIT_PREFIX',
]) {
  delete process.env[name];
}

// A fixed seed and reference date make a failing run's faker values reproduce,
// dates included, since faker otherwise dates from the wall clock.
faker.seed(142);
faker.setDefaultRefDate(new Date('2026-01-01T00:00:00Z'));

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
  decisionAnswers.clear();
  messagesReplies.splice(0);
});

afterAll(() => {
  server.close();
});
