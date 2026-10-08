import { afterAll, afterEach, beforeAll } from 'bun:test';
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

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
