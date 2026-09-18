import { setupServer } from 'msw/node';

// No default handler, and the preload sets onUnhandledRequest to 'error', so a
// call this package makes without a per-test handler fails the test rather than
// reaching the network.
export const server = setupServer();
