import { expect, test } from 'bun:test';
import { buildStubTimeout } from '../../test-utils/build-stub-timeout.ts';
import { buildMockRuntime } from '../../test-utils/factories/build-mock-runtime.ts';
import { createDeadlineSignal } from './create-deadline-signal.ts';

test.each([
  ['no shared deadline', undefined, 5000],
  ['a shared deadline later than the limit', 1_000_009_000, 5000],
  ['a shared deadline sooner than the limit', 1_000_000_100, 100],
  ['a shared deadline less than a millisecond away', 1_000_000_000.5, 1],
])('it starts the timer for %s at the delay the step has left', (_label, deadlineAt, delay) => {
  const timer = buildStubTimeout();

  createDeadlineSignal(5000, {
    deadlineAt,
    runtime: buildMockRuntime({ now: () => 1_000_000_000, timeout: timer.timeout }),
  });

  expect(timer.timeout).toHaveBeenCalledExactlyOnceWith(delay);
});

test('it starts no timer once the shared deadline has passed', () => {
  const timer = buildStubTimeout();

  const signal = createDeadlineSignal(5000, {
    deadlineAt: 1_000_000_000,
    runtime: buildMockRuntime({ now: () => 1_000_000_000, timeout: timer.timeout }),
  });

  expect(signal).toBeNull();
  expect(timer.timeout).not.toHaveBeenCalled();
});

test('it starts no timer once the caller has cancelled', () => {
  const timer = buildStubTimeout();

  const signal = createDeadlineSignal(5000, {
    signal: AbortSignal.abort(),
    runtime: buildMockRuntime({ timeout: timer.timeout }),
  });

  expect(signal).toBeNull();
  expect(timer.timeout).not.toHaveBeenCalled();
});

test('it aborts when its timer fires', () => {
  const timer = buildStubTimeout();

  const signal = createDeadlineSignal(5000, {
    signal: new AbortController().signal,
    runtime: buildMockRuntime({ timeout: timer.timeout }),
  });

  timer.emitTimeout(1);

  expect(signal?.aborted).toBe(true);
});

test('it aborts when the caller cancels', () => {
  const timer = buildStubTimeout();

  const controller = new AbortController();

  const signal = createDeadlineSignal(5000, {
    signal: controller.signal,
    runtime: buildMockRuntime({ timeout: timer.timeout }),
  });

  controller.abort();

  expect(signal?.aborted).toBe(true);
});
