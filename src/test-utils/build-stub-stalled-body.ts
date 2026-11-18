// MSW never ends a mocked body when the client aborts, so this body fails with
// the request signal's abort reason, as a real transport does, after it sends
// its first chunk and stalls on the next read.
export function buildStubStalledBody(
  firstChunk: string,
  signal: Readonly<AbortSignal>,
  onStall: () => void,
): ReadableStream<Uint8Array> {
  let reads = 0;

  return new ReadableStream<Uint8Array>(
    {
      start(controller) {
        signal.addEventListener('abort', () => {
          controller.error(signal.reason);
        });
      },
      async pull(controller) {
        reads += 1;

        if (reads === 1) {
          controller.enqueue(new TextEncoder().encode(firstChunk));

          return;
        }

        onStall();

        await new Promise<void>(() => {});
      },
    },

    // The interceptor buffers one read before fetch resolves; a zero high-water
    // mark leaves the second read to the client's body parse.
    { highWaterMark: 0 },
  );
}
