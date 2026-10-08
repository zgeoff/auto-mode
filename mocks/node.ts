import { setupServer } from 'msw/node';
import { handlers } from './handlers.ts';

// The preload sets onUnhandledRequest to 'error', so a request to any host the
// default handlers do not answer fails the test rather than reaching the network.
export const server = setupServer(...handlers);
