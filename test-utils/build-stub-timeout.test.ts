import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { buildStubTimeout } from './build-stub-timeout.ts';

test('it starts each timer live', () => {
  const stub = buildStubTimeout();

  expect(stub.timeout(5000).aborted).toBeFalse();
});

test('it fires only the timer of the expired call', () => {
  const stub = buildStubTimeout();
  const first = stub.timeout(5000);
  const second = stub.timeout(3500);

  stub.emitTimeout(2);

  expect(first.aborted).toBeFalse();
  expect(second.aborted).toBeTrue();
});

test('it starts a timer already fired when its call expired beforehand', () => {
  const stub = buildStubTimeout();

  stub.emitTimeout(1);

  expect(stub.timeout(5000).aborted).toBeTrue();
});

test('it fires with the same reason as the real timer', async () => {
  const stub = buildStubTimeout();
  const real = AbortSignal.timeout(0);

  await new Promise((resolve) => {
    real.addEventListener('abort', resolve, { once: true });
  });

  const signal = stub.timeout(0);

  stub.emitTimeout(1);

  const expected: unknown = real.reason;

  invariant(expected instanceof DOMException, 'the real timer fires with a DOMException');

  expect(signal.reason).toBeInstanceOf(DOMException);
  expect(signal.reason).toMatchObject({ name: expected.name, message: expected.message });
});
