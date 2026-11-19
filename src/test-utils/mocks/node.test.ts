import { expect, onTestFinished, test } from 'bun:test';

test('it answers a request to an unmatched external host with HTTP 500', async () => {
  const response = await fetch('https://unmatched.test/notes');
  const body: unknown = await response.json();

  expect({ status: response.status, body }).toStrictEqual({
    status: 500,
    body: {
      name: 'Error',
      message: 'the test sent a request that no handler matches',
      stack: expect.any(String),
    },
  });
});

test('it lets a request to a loopback host reach the listener', async () => {
  const reply = 'from the listener';
  const handleRequest = () => new Response(reply);
  const listener = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: handleRequest });

  onTestFinished(() => listener.stop(true));

  const response = await fetch(listener.url);
  const body = await response.text();

  expect(body).toBe('from the listener');
});
