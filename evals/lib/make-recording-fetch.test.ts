import { expect, mock, test } from 'bun:test';
import { HttpResponse, http } from 'msw';
import invariant from 'tiny-invariant';
import { server } from '../../mocks/node.ts';
import { makeRecordingFetch } from './make-recording-fetch.ts';
import type { ResponseCopy } from './make-recording-fetch.ts';

test('it keeps a readable copy of each response after the original is read', async () => {
  server.use(http.post('https://recording.test/send', () => HttpResponse.json({ ok: true })));

  const responses: ResponseCopy[] = [];
  const sendFetch = makeRecordingFetch(fetch, { redirect: 'error', responses });

  const response = await sendFetch('https://recording.test/send', { method: 'POST' });

  await response.json();

  const [copy] = responses;

  invariant(copy, 'the copy is kept');

  const body: unknown = await copy.json();

  expect(responses).toHaveLength(1);
  expect(body).toStrictEqual({ ok: true });
});

test('it reports each attempt before it goes out', async () => {
  const sent = mock();

  server.use(http.post('https://recording.test/send', () => HttpResponse.json({ ok: true })));

  const sendFetch = makeRecordingFetch(fetch, {
    redirect: 'error',
    responses: [],
    onSend: () => {
      sent();
    },
  });

  await sendFetch('https://recording.test/send', { method: 'POST' });

  expect(sent).toHaveBeenCalledOnce();
});

test('it sends nothing when the attempt report refuses the attempt', () => {
  const reached = mock();

  server.use(
    http.post('https://recording.test/send', () => {
      reached();

      return HttpResponse.json({ ok: true });
    }),
  );

  const sendFetch = makeRecordingFetch(fetch, {
    redirect: 'error',
    responses: [],
    onSend: () => {
      throw new Error('The request allocation is spent.');
    },
  });

  expect(sendFetch('https://recording.test/send', { method: 'POST' })).rejects.toThrowWithMessage(
    Error,
    /^The request allocation is spent\.$/u,
  );

  expect(reached).not.toHaveBeenCalled();
});

test('it returns a redirect unfollowed when redirects are manual', async () => {
  const followed = mock();

  server.use(
    http.post(
      'https://recording.test/send',
      () =>
        new HttpResponse(null, { status: 307, headers: { location: 'https://elsewhere.test/' } }),
    ),
    http.post('https://elsewhere.test/', () => {
      followed();

      return HttpResponse.json({ ok: true });
    }),
  );

  const sendFetch = makeRecordingFetch(fetch, { redirect: 'manual', responses: [] });

  const response = await sendFetch('https://recording.test/send', { method: 'POST' });

  expect(response.status).toBe(307);
  expect(followed).not.toHaveBeenCalled();
});

test('it fails a redirect when redirects are errors', () => {
  server.use(
    http.post(
      'https://recording.test/send',
      () =>
        new HttpResponse(null, { status: 307, headers: { location: 'https://elsewhere.test/' } }),
    ),
  );

  const sendFetch = makeRecordingFetch(fetch, { redirect: 'error', responses: [] });

  expect(sendFetch('https://recording.test/send', { method: 'POST' })).rejects.toThrow();
});
