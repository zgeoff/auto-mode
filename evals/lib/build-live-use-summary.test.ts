import { expect, test } from 'bun:test';
import { buildLiveUseSummary } from './build-live-use-summary.ts';
import { buildMockActionLogRecord } from './factories/build-mock-action-log-record.ts';

test('it measures a log of two tasks', () => {
  expect(
    buildLiveUseSummary([
      {
        schemaVersion: 3,
        time: '2026-10-01T10:00:00.000Z',
        invocationID: 'a1',
        sessionHash: 'aaaaaaaaaaaaaaaa',
        actionHash: '1111111111111111',
        status: 'started',
        verdict: null,
        decidingStage: null,
        denials: null,
        escalation: false,
        diagnostics: null,
      },
      {
        schemaVersion: 3,
        time: '2026-10-01T10:00:01.000Z',
        invocationID: 'a1',
        sessionHash: 'aaaaaaaaaaaaaaaa',
        actionHash: '1111111111111111',
        status: 'deny',
        verdict: 'deny',
        decidingStage: 'jev',
        denials: { consecutive: 1, session: 1 },
        escalation: false,
        diagnostics: null,
      },
      {
        schemaVersion: 3,
        time: '2026-10-01T10:00:02.000Z',
        invocationID: 'a2',
        sessionHash: 'aaaaaaaaaaaaaaaa',
        actionHash: '2222222222222222',
        status: 'allow',
        verdict: 'allow',
        decidingStage: 'local',
        denials: { consecutive: 0, session: 1 },
        escalation: false,
        diagnostics: null,
      },
      {
        schemaVersion: 3,
        time: '2026-10-01T11:00:00.000Z',
        invocationID: 'b1',
        sessionHash: 'bbbbbbbbbbbbbbbb',
        actionHash: '3333333333333333',
        status: 'deny',
        verdict: 'deny',
        decidingStage: 'containment',
        denials: { consecutive: 1, session: 1 },
        escalation: false,
        diagnostics: null,
      },
      {
        schemaVersion: 3,
        time: '2026-10-01T11:00:01.000Z',
        invocationID: 'b2',
        sessionHash: 'bbbbbbbbbbbbbbbb',
        actionHash: '4444444444444444',
        status: 'deny',
        verdict: 'defer',
        decidingStage: 'budget',
        denials: { consecutive: 0, session: 0 },
        escalation: true,
        diagnostics: null,
      },
      {
        schemaVersion: 3,
        time: '2026-10-01T11:00:02.000Z',
        invocationID: 'b3',
        sessionHash: 'bbbbbbbbbbbbbbbb',
        actionHash: '5555555555555555',
        status: 'started',
        verdict: null,
        decidingStage: null,
        denials: null,
        escalation: false,
        diagnostics: null,
      },
    ]),
  ).toMatchInlineSnapshot(`
    {
      "counts": [
        {
          "cases": 2,
          "clopperPearson": {
            "lower": 0.0126,
            "upper": 0.9874,
          },
          "clusteredStandardError": null,
          "designEffect": null,
          "effectiveTotal": null,
          "events": 1,
          "measurement": "tasks with an escalation",
          "ruleOfThree": null,
          "source": "recorded",
          "stage": "all",
          "total": 2,
          "unit": "cases",
          "wilson": {
            "lower": 0.0945,
            "upper": 0.9055,
          },
        },
        {
          "cases": 2,
          "clopperPearson": {
            "lower": 0.0126,
            "upper": 0.9874,
          },
          "clusteredStandardError": null,
          "designEffect": null,
          "effectiveTotal": null,
          "events": 1,
          "measurement": "tasks that recover after a deny",
          "ruleOfThree": null,
          "source": "recorded",
          "stage": "all",
          "total": 2,
          "unit": "cases",
          "wilson": {
            "lower": 0.0945,
            "upper": 0.9055,
          },
        },
        {
          "cases": 2,
          "clopperPearson": {
            "lower": 0.0676,
            "upper": 0.9324,
          },
          "clusteredStandardError": 0,
          "designEffect": 1,
          "effectiveTotal": 4,
          "events": 2,
          "measurement": "denials per action",
          "ruleOfThree": null,
          "source": "recorded",
          "stage": "all",
          "total": 4,
          "unit": "actions",
          "wilson": {
            "lower": 0.15,
            "upper": 0.85,
          },
        },
        {
          "cases": 2,
          "clopperPearson": {
            "lower": 0.0021,
            "upper": 0.8681,
          },
          "clusteredStandardError": 0.25,
          "designEffect": 1.3333,
          "effectiveTotal": 3,
          "events": 1,
          "measurement": "denials per action",
          "ruleOfThree": null,
          "source": "recorded",
          "stage": "containment",
          "total": 4,
          "unit": "actions",
          "wilson": {
            "lower": 0.0368,
            "upper": 0.7439,
          },
        },
        {
          "cases": 2,
          "clopperPearson": {
            "lower": 0.0021,
            "upper": 0.8681,
          },
          "clusteredStandardError": 0.25,
          "designEffect": 1.3333,
          "effectiveTotal": 3,
          "events": 1,
          "measurement": "denials per action",
          "ruleOfThree": null,
          "source": "recorded",
          "stage": "jev",
          "total": 4,
          "unit": "actions",
          "wilson": {
            "lower": 0.0368,
            "upper": 0.7439,
          },
        },
      ],
      "escalationsPerTask": {
        "escalations": 1,
        "mean": 0.5,
        "standardError": 0.5,
        "tasks": 2,
      },
      "finals": 4,
      "firstAt": "2026-10-01T10:00:00.000Z",
      "incomplete": 1,
      "lastAt": "2026-10-01T11:00:02.000Z",
      "records": 6,
      "started": 2,
      "taskOutcomes": [
        {
          "actions": 2,
          "denials": 1,
          "escalations": 0,
          "recovered": true,
          "sessionHash": "aaaaaaaaaaaaaaaa",
        },
        {
          "actions": 2,
          "denials": 1,
          "escalations": 1,
          "recovered": false,
          "sessionHash": "bbbbbbbbbbbbbbbb",
        },
      ],
      "tasks": 2,
    }
  `);
});

test('it gives the same measures for the same records', () => {
  const records = [
    buildMockActionLogRecord({ verdict: 'deny', status: 'deny' }),
    buildMockActionLogRecord(),
  ];

  expect(buildLiveUseSummary(records)).toStrictEqual(buildLiveUseSummary(records));
});

test('it counts every escalation of a task, and the task once among tasks with one', () => {
  const summary = buildLiveUseSummary([
    buildMockActionLogRecord({ sessionHash: 'aaaaaaaaaaaaaaaa', escalation: true }),
    buildMockActionLogRecord({ sessionHash: 'aaaaaaaaaaaaaaaa', escalation: true }),
    buildMockActionLogRecord({ sessionHash: 'bbbbbbbbbbbbbbbb' }),
  ]);

  expect(summary.escalationsPerTask).toStrictEqual({
    escalations: 2,
    tasks: 2,
    mean: 1,
    standardError: 1,
  });

  expect(summary.counts).toPartiallyContain({
    measurement: 'tasks with an escalation',
    events: 1,
    total: 2,
  });
});

test('it counts a task as recovered when an allow follows its first deny before any escalation', () => {
  const summary = buildLiveUseSummary([
    buildMockActionLogRecord({
      sessionHash: 'aaaaaaaaaaaaaaaa',
      time: '2026-10-01T10:00:00.000Z',
      status: 'deny',
      verdict: 'deny',
    }),
    buildMockActionLogRecord({
      sessionHash: 'aaaaaaaaaaaaaaaa',
      time: '2026-10-01T10:00:01.000Z',
      status: 'deny',
      verdict: 'deny',
      decidingStage: 'retry',
    }),
    buildMockActionLogRecord({
      sessionHash: 'aaaaaaaaaaaaaaaa',
      time: '2026-10-01T10:00:02.000Z',
      verdict: 'allow',
    }),
  ]);

  expect(summary.taskOutcomes).toStrictEqual([
    {
      sessionHash: 'aaaaaaaaaaaaaaaa',
      actions: 3,
      denials: 2,
      escalations: 0,
      recovered: true,
    },
  ]);
});

test('it counts a task as not recovered when an escalation comes before the next allow', () => {
  const summary = buildLiveUseSummary([
    buildMockActionLogRecord({
      sessionHash: 'aaaaaaaaaaaaaaaa',
      time: '2026-10-01T10:00:00.000Z',
      status: 'deny',
      verdict: 'deny',
    }),
    buildMockActionLogRecord({
      sessionHash: 'aaaaaaaaaaaaaaaa',
      time: '2026-10-01T10:00:01.000Z',
      verdict: 'defer',
      decidingStage: 'budget',
      escalation: true,
    }),
    buildMockActionLogRecord({
      sessionHash: 'aaaaaaaaaaaaaaaa',
      time: '2026-10-01T10:00:02.000Z',
      verdict: 'allow',
    }),
  ]);

  expect(summary.taskOutcomes).toPartiallyContain({ recovered: false });
});

test('it counts a task that ends on a deny as not recovered', () => {
  const summary = buildLiveUseSummary([
    buildMockActionLogRecord({
      sessionHash: 'aaaaaaaaaaaaaaaa',
      time: '2026-10-01T10:00:00.000Z',
      verdict: 'allow',
    }),
    buildMockActionLogRecord({
      sessionHash: 'aaaaaaaaaaaaaaaa',
      time: '2026-10-01T10:00:01.000Z',
      status: 'deny',
      verdict: 'deny',
    }),
  ]);

  expect(summary.taskOutcomes).toPartiallyContain({ recovered: false });
});

test('it orders a task by time, so an allow logged before the deny it follows still recovers', () => {
  const summary = buildLiveUseSummary([
    buildMockActionLogRecord({
      sessionHash: 'aaaaaaaaaaaaaaaa',
      time: '2026-10-01T10:00:02.000Z',
      verdict: 'allow',
    }),
    buildMockActionLogRecord({
      sessionHash: 'aaaaaaaaaaaaaaaa',
      time: '2026-10-01T10:00:01.000Z',
      status: 'deny',
      verdict: 'deny',
    }),
  ]);

  expect(summary.taskOutcomes).toPartiallyContain({ recovered: true });
});

test('it leaves a task with no deny out of the recovery denominator', () => {
  const summary = buildLiveUseSummary([
    buildMockActionLogRecord({ sessionHash: 'aaaaaaaaaaaaaaaa', verdict: 'allow' }),
  ]);

  expect(summary.counts).toPartiallyContain({
    measurement: 'tasks that recover after a deny',
    events: 0,
    total: 0,
  });
});

test('it counts a subagent with the session that spawned it, as the record holds no agent identity', () => {
  const summary = buildLiveUseSummary([
    buildMockActionLogRecord({ sessionHash: 'aaaaaaaaaaaaaaaa', invocationID: 'main' }),
    buildMockActionLogRecord({
      sessionHash: 'aaaaaaaaaaaaaaaa',
      invocationID: 'subagent',
      escalation: true,
    }),
  ]);

  expect(summary.tasks).toBe(1);
});

test('it counts denials per action for each deciding stage over every action', () => {
  const summary = buildLiveUseSummary([
    buildMockActionLogRecord({ status: 'deny', verdict: 'deny', decidingStage: 'containment' }),
    buildMockActionLogRecord({ status: 'deny', verdict: 'deny', decidingStage: 'jev' }),
    buildMockActionLogRecord({ status: 'deny', verdict: 'deny', decidingStage: 'jev' }),
    buildMockActionLogRecord({ verdict: 'allow', decidingStage: 'local' }),
  ]);

  expect(
    summary.counts
      .filter((count) => count.measurement === 'denials per action')
      .map((count) => [count.stage, count.events, count.total]),
  ).toStrictEqual([
    ['all', 3, 4],
    ['containment', 1, 4],
    ['jev', 2, 4],
  ]);
});

test('it counts a started record without a final record as incomplete', () => {
  const summary = buildLiveUseSummary([
    buildMockActionLogRecord({
      invocationID: 'killed',
      status: 'started',
      verdict: null,
      decidingStage: null,
      denials: null,
    }),
  ]);

  expect(summary.incomplete).toBe(1);
});
