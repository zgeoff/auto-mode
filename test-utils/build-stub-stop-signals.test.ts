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

test('it records each subscription and its unsubscribe', () => {
  const signals = buildStubStopSignals();
  const onStop = mock<() => void>();
  const unsubscribe = signals.subscribeToStopSignals(onStop);

  unsubscribe();

  expect(signals.subscribeToStopSignals).toHaveBeenCalledExactlyOnceWith(onStop);
  expect(signals.unsubscribe).toHaveBeenCalledOnce();
});
