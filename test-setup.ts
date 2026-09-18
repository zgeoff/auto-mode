import { afterAll, afterEach, beforeAll } from 'bun:test';
import { server } from './mocks/node.ts';

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
