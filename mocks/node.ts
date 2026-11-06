import { FetchInterceptor } from '@mswjs/interceptors/fetch/web';
import { HttpNetworkFrame, InterceptorSource, defineNetwork } from 'msw/experimental';
import { handlers } from './handlers.ts';

const loopbackHosts = new Set(['127.0.0.1', '[::1]', 'localhost']);

// MSW 3's setupServer intercepts at Node's sockets, which Bun's native fetch
// never opens, so its handlers miss every request (mswjs/msw#2811).
export const server = defineNetwork({
  sources: [new InterceptorSource({ interceptors: [new FetchInterceptor()] })],
  handlers,
  context: { quiet: true },

  // a test calls a real listener on an ephemeral loopback port
  onUnhandledFrame: (unhandled) => {
    const url =
      unhandled.frame instanceof HttpNetworkFrame
        ? new URL(unhandled.frame.data.request.url)
        : null;

    if (url !== null && loopbackHosts.has(url.hostname)) {
      return;
    }

    unhandled.defaults.error();
    throw new Error('the test sent a request that no handler matches');
  },
});
