import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import type * as z from 'zod';
import { relayConsentSegmentSchema } from './relay-consent-segment-schema.ts';

test('it accepts a recorded run segment', () => {
  const segment: z.input<typeof relayConsentSegmentSchema> = {
    runnerCommit: 'b51d093',
    startedAt: '2026-10-05T14:10:33.257Z',
    completedAt: '2026-10-05T14:12:12.368Z',
    firstIndex: 471,
    lastIndex: 759,
    stoppedEarly: null,
  };

  expect(relayConsentSegmentSchema.safeParse(segment).data).toStrictEqual(segment);
});

test('it accepts a run segment whose commit, times and indices are unknown', () => {
  const segment: z.input<typeof relayConsentSegmentSchema> = {
    runnerCommit: null,
    startedAt: null,
    completedAt: null,
    firstIndex: null,
    lastIndex: null,
    stoppedEarly: 'failure',
  };

  expect(relayConsentSegmentSchema.safeParse(segment).data).toStrictEqual(segment);
});

test('it rejects a run segment without a start time', () => {
  const result = relayConsentSegmentSchema.safeParse({
    runnerCommit: 'b51d093',
    completedAt: '2026-10-05T14:12:12.368Z',
    firstIndex: 471,
    lastIndex: 759,
    stoppedEarly: null,
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['startedAt'] });
});

test('it rejects a run segment stopped for an unknown reason', () => {
  const result = relayConsentSegmentSchema.safeParse({
    runnerCommit: 'b51d093',
    startedAt: '2026-10-05T14:10:33.257Z',
    completedAt: '2026-10-05T14:12:12.368Z',
    firstIndex: 471,
    lastIndex: 759,
    stoppedEarly: 'timeout',
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['stoppedEarly'] });
});
