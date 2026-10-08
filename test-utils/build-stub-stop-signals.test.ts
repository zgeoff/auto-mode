import { expect, mock, test } from 'bun:test';
import { buildStubStopSignals } from './build-stub-stop-signals.ts';

test('it calls a subscribed callback when stopped', () => {
  const signals = buildStubStopSignals();
  const onStop = mock<() => void>();

  signals.subscribeToStopSignals(onStop);
  signals.stop();

  expect(onStop).toHaveBeenCalledOnce();
});

test('it never calls a callback after its unsubscribe', () => {
  const signals = buildStubStopSignals();
  const onStop = mock<() => void>();
  const unsubscribe = signals.subscribeToStopSignals(onStop);

  unsubscribe();

  signals.stop();

  expect(onStop).not.toHaveBeenCalled();
});

test('it keeps calling another subscriber after one unsubscribes', () => {
  const signals = buildStubStopSignals();
  const first = mock<() => void>();
  const second = mock<() => void>();
  const unsubscribeFirst = signals.subscribeToStopSignals(first);

  signals.subscribeToStopSignals(second);

  unsubscribeFirst();

  signals.stop();

  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledOnce();
});
