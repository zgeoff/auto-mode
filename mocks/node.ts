import { setupServer } from 'msw/node';
import { handlers } from './handlers.ts';

// The preload fails a request to any non-loopback host the default handlers do
// not answer, so no test request reaches the network.
export const server = setupServer(...handlers);
