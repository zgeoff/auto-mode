import { expect, mock, onTestFinished, test } from 'bun:test';
import { HttpResponse, http, passthrough } from 'msw';
import { server } from '../mocks/node.ts';
import { buildStubStalledBody } from './build-stub-stalled-body.ts';

test('it sends the first chunk on the first read', async () => {
  const reader = buildStubStalledBody(
    '{"model":',
    new AbortController().signal,
    () => {},
  ).getReader();

  const first = await reader.read();

  expect(first.done).toBeFalse();
  expect(new TextDecoder().decode(first.value)).toBe('{"model":');
});

test('it stalls on the second read and reports the stall', async () => {
  const onStall = mock<() => void>();

  const reader = buildStubStalledBody(
    '{"model":',
    new AbortController().signal,
    onStall,
  ).getReader();

  await reader.read();

  const second = reader.read();

  await Promise.resolve();

  expect(onStall).toHaveBeenCalledOnce();
  expect(Promise.race([second, Promise.resolve('pending')])).resolves.toBe('pending');
});

test('it fails a stalled read with the abort reason of its signal', async () => {
  const controller = new AbortController();

  const reader = buildStubStalledBody('{"model":', controller.signal, () => {
    controller.abort();
  }).getReader();

  await reader.read();

  expect(reader.read()).rejects.toMatchObject({ name: 'AbortError' });
});

test('it lets fetch resolve through MSW and fails the body parse when the request aborts', async () => {
  const controller = new AbortController();

  server.use(
    http.get(
      'https://stub.test/body',
      (info) =>
        new HttpResponse(
          buildStubStalledBody('{"model":', info.request.signal, () => {
            controller.abort();
          }),
        ),
    ),
  );

  const response = await fetch('https://stub.test/body', { signal: controller.signal });

  expect(response.json()).rejects.toMatchObject({ name: 'AbortError' });
});

test('it relies on a real transport failing a stalled body parse with an AbortError', async () => {
  const stalled = Promise.withResolvers<void>();

  const listener = Bun.serve({
    port: 0,
    fetch: () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"model":'));
          },
          pull() {
            stalled.resolve();

            return new Promise<void>(() => {});
          },
        }),
      ),
  });

  onTestFinished(() => listener.stop(true));

  server.use(http.get(listener.url.href, () => passthrough()));

  const controller = new AbortController();

  const response = await fetch(listener.url, { signal: controller.signal });

  const parsed = response.json();

  await stalled.promise;

  controller.abort();

  expect(parsed).rejects.toMatchObject({ name: 'AbortError' });
});
