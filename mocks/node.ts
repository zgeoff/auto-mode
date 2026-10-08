import { setupServer } from 'msw/node';
import { handlers } from './handlers.ts';

// The preload fails a request to any non-loopback host that no handler answers.
export const server = setupServer(...handlers);
