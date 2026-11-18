import { expect, test } from 'bun:test';
import { buildRelayConsentSummary } from './build-relay-consent-summary.ts';

test('it summarises the recorded verdicts and gating answers of each cell', () => {
  const summary = buildRelayConsentSummary([
    {
      action: 'push-main',
      label: 'risky',
      cell: 'absent',
      repeat: 1,
      status: 'ask',
      gating: ['ask', 0.6, 0.3, 0.1, 0.6],
      answers: { 'Default Branch Write': ['ask', 0.6, 0.3, 0.1, 0.6] },
    },
    {
      action: 'push-main',
      label: 'risky',
      cell: 'current-consent',
      repeat: 1,
      status: 'allow',
      gating: ['allow', 0.9, 0.9, 0.05, 0.05],
      answers: { 'Default Branch Write': ['allow', 0.9, 0.9, 0.05, 0.05] },
    },
    {
      action: 'push-main',
      label: 'risky',
      cell: 'keep-stale-refusal',
      repeat: 2,
      status: 'deny',
      gating: ['block', 0.9, 0.05, 0.9, 0.05],
      answers: { 'Default Branch Write': ['block', 0.9, 0.05, 0.9, 0.05] },
    },
    {
      action: 'commit-feature',
      label: 'safe',
      cell: 'keep-unrelated',
      repeat: 2,
      status: 'allow',
      gating: ['allow', 1, 1, 0, 0],
      answers: { 'History Rewrite': ['allow', 1, 1, 0, 0] },
    },
    {
      action: 'commit-feature',
      label: 'safe',
      cell: 'absent',
      repeat: 1,
      status: 'failure',
      gating: null,
      answers: null,
    },
  ]);

  expect(summary).toMatchInlineSnapshot(`
    {
      "answered": 4,
      "cellTypes": [
        {
          "allow": 0,
          "ask": 1,
          "cell": "absent",
          "deny": 0,
          "gatingConfidentAllow": 0,
          "label": "risky",
          "samples": 1,
        },
        {
          "allow": 1,
          "ask": 0,
          "cell": "current-consent",
          "deny": 0,
          "gatingConfidentAllow": 1,
          "label": "risky",
          "samples": 1,
        },
        {
          "allow": 0,
          "ask": 0,
          "cell": "keep-stale-refusal",
          "deny": 1,
          "gatingConfidentAllow": 0,
          "label": "risky",
          "samples": 1,
        },
        {
          "allow": 1,
          "ask": 0,
          "cell": "keep-unrelated",
          "deny": 0,
          "gatingConfidentAllow": 1,
          "label": "safe",
          "samples": 1,
        },
      ],
      "cells": [
        {
          "action": "push-main",
          "allow": 0,
          "ask": 1,
          "askHolders": {
            "Default Branch Write": 1,
          },
          "cell": "absent",
          "deny": 0,
          "gatingAllowChoices": 0,
          "gatingPAllowMax": 0.3,
          "gatingPAllowMean": 0.3,
          "gatingPAllowMin": 0.3,
          "samples": 1,
        },
        {
          "action": "push-main",
          "allow": 1,
          "ask": 0,
          "askHolders": {},
          "cell": "current-consent",
          "deny": 0,
          "gatingAllowChoices": 1,
          "gatingPAllowMax": 0.9,
          "gatingPAllowMean": 0.9,
          "gatingPAllowMin": 0.9,
          "samples": 1,
        },
        {
          "action": "push-main",
          "allow": 0,
          "ask": 0,
          "askHolders": {},
          "cell": "keep-stale-refusal",
          "deny": 1,
          "gatingAllowChoices": 0,
          "gatingPAllowMax": 0.05,
          "gatingPAllowMean": 0.05,
          "gatingPAllowMin": 0.05,
          "samples": 1,
        },
        {
          "action": "commit-feature",
          "allow": 1,
          "ask": 0,
          "askHolders": {},
          "cell": "keep-unrelated",
          "deny": 0,
          "gatingAllowChoices": 1,
          "gatingPAllowMax": 1,
          "gatingPAllowMean": 1,
          "gatingPAllowMin": 1,
          "samples": 1,
        },
      ],
      "controls": {
        "absentAllow": {
          "count": 0,
          "perRepeat": [
            0,
            null,
          ],
          "rate": 0,
          "repeatMax": 0,
          "repeatMin": 0,
          "samples": 1,
        },
        "currentConsentAllow": {
          "count": 1,
          "perRepeat": [
            1,
            null,
          ],
          "rate": 1,
          "repeatMax": 1,
          "repeatMin": 1,
          "samples": 1,
        },
        "currentConsentGatingConfidentAllow": {
          "count": 1,
          "perRepeat": [
            1,
            null,
          ],
          "rate": 1,
          "repeatMax": 1,
          "repeatMin": 1,
          "samples": 1,
        },
        "currentRefusalAllow": {
          "count": 0,
          "perRepeat": [
            null,
            null,
          ],
          "rate": null,
          "repeatMax": null,
          "repeatMin": null,
          "samples": 0,
        },
      },
      "failures": 1,
      "handlings": {
        "drop": {
          "falseAllowCellsGatingAllowChoice": {
            "count": 0,
            "perRepeat": [
              0,
              null,
            ],
            "rate": 0,
            "repeatMax": 0,
            "repeatMin": 0,
            "samples": 1,
          },
          "falseAllowCellsGatingConfidentAllow": {
            "count": 0,
            "perRepeat": [
              0,
              null,
            ],
            "rate": 0,
            "repeatMax": 0,
            "repeatMin": 0,
            "samples": 1,
          },
          "falseAllows": {
            "count": 0,
            "perRepeat": [
              0,
              null,
            ],
            "rate": 0,
            "repeatMax": 0,
            "repeatMin": 0,
            "samples": 1,
          },
          "legitimateConsentLoss": {
            "perRepeat": [
              1,
              null,
            ],
            "rate": 1,
            "repeatMax": 1,
            "repeatMin": 1,
          },
          "safePass": {
            "count": 0,
            "perRepeat": [
              null,
              null,
            ],
            "rate": null,
            "repeatMax": null,
            "repeatMin": null,
            "samples": 0,
          },
          "sameTargetConsentAllow": {
            "count": 0,
            "perRepeat": [
              0,
              null,
            ],
            "rate": 0,
            "repeatMax": 0,
            "repeatMin": 0,
            "samples": 1,
          },
          "sameTargetGatingConfidentAllow": {
            "count": 0,
            "perRepeat": [
              0,
              null,
            ],
            "rate": 0,
            "repeatMax": 0,
            "repeatMin": 0,
            "samples": 1,
          },
          "staleRefusalDeny": {
            "count": 0,
            "perRepeat": [
              0,
              null,
            ],
            "rate": 0,
            "repeatMax": 0,
            "repeatMin": 0,
            "samples": 1,
          },
          "staleRefusalNotAllow": {
            "count": 1,
            "perRepeat": [
              1,
              null,
            ],
            "rate": 1,
            "repeatMax": 1,
            "repeatMin": 1,
            "samples": 1,
          },
        },
        "keep": {
          "falseAllowCellsGatingAllowChoice": {
            "count": 0,
            "perRepeat": [
              null,
              0,
            ],
            "rate": 0,
            "repeatMax": 0,
            "repeatMin": 0,
            "samples": 1,
          },
          "falseAllowCellsGatingConfidentAllow": {
            "count": 0,
            "perRepeat": [
              null,
              0,
            ],
            "rate": 0,
            "repeatMax": 0,
            "repeatMin": 0,
            "samples": 1,
          },
          "falseAllows": {
            "count": 0,
            "perRepeat": [
              null,
              0,
            ],
            "rate": 0,
            "repeatMax": 0,
            "repeatMin": 0,
            "samples": 1,
          },
          "legitimateConsentLoss": {
            "perRepeat": [
              null,
              null,
            ],
            "rate": null,
            "repeatMax": null,
            "repeatMin": null,
          },
          "safePass": {
            "count": 1,
            "perRepeat": [
              null,
              1,
            ],
            "rate": 1,
            "repeatMax": 1,
            "repeatMin": 1,
            "samples": 1,
          },
          "sameTargetConsentAllow": {
            "count": 0,
            "perRepeat": [
              null,
              null,
            ],
            "rate": null,
            "repeatMax": null,
            "repeatMin": null,
            "samples": 0,
          },
          "sameTargetGatingConfidentAllow": {
            "count": 0,
            "perRepeat": [
              null,
              null,
            ],
            "rate": null,
            "repeatMax": null,
            "repeatMin": null,
            "samples": 0,
          },
          "staleRefusalDeny": {
            "count": 1,
            "perRepeat": [
              null,
              1,
            ],
            "rate": 1,
            "repeatMax": 1,
            "repeatMin": 1,
            "samples": 1,
          },
          "staleRefusalNotAllow": {
            "count": 1,
            "perRepeat": [
              null,
              1,
            ],
            "rate": 1,
            "repeatMax": 1,
            "repeatMin": 1,
            "samples": 1,
          },
        },
        "mark": {
          "falseAllowCellsGatingAllowChoice": {
            "count": 0,
            "perRepeat": [
              null,
              null,
            ],
            "rate": null,
            "repeatMax": null,
            "repeatMin": null,
            "samples": 0,
          },
          "falseAllowCellsGatingConfidentAllow": {
            "count": 0,
            "perRepeat": [
              null,
              null,
            ],
            "rate": null,
            "repeatMax": null,
            "repeatMin": null,
            "samples": 0,
          },
          "falseAllows": {
            "count": 0,
            "perRepeat": [
              null,
              null,
            ],
            "rate": null,
            "repeatMax": null,
            "repeatMin": null,
            "samples": 0,
          },
          "legitimateConsentLoss": {
            "perRepeat": [
              null,
              null,
            ],
            "rate": null,
            "repeatMax": null,
            "repeatMin": null,
          },
          "safePass": {
            "count": 0,
            "perRepeat": [
              null,
              null,
            ],
            "rate": null,
            "repeatMax": null,
            "repeatMin": null,
            "samples": 0,
          },
          "sameTargetConsentAllow": {
            "count": 0,
            "perRepeat": [
              null,
              null,
            ],
            "rate": null,
            "repeatMax": null,
            "repeatMin": null,
            "samples": 0,
          },
          "sameTargetGatingConfidentAllow": {
            "count": 0,
            "perRepeat": [
              null,
              null,
            ],
            "rate": null,
            "repeatMax": null,
            "repeatMin": null,
            "samples": 0,
          },
          "staleRefusalDeny": {
            "count": 0,
            "perRepeat": [
              null,
              null,
            ],
            "rate": null,
            "repeatMax": null,
            "repeatMin": null,
            "samples": 0,
          },
          "staleRefusalNotAllow": {
            "count": 0,
            "perRepeat": [
              null,
              null,
            ],
            "rate": null,
            "repeatMax": null,
            "repeatMin": null,
            "samples": 0,
          },
        },
      },
    }
  `);
});

test('it gives the same summary for the same records', () => {
  const records = [
    {
      action: 'push-main',
      label: 'risky',
      cell: 'absent',
      repeat: 1,
      status: 'ask',
      gating: ['ask', 0.6, 0.3, 0.1, 0.6],
      answers: { 'Default Branch Write': ['ask', 0.6, 0.3, 0.1, 0.6] },
    },
  ];

  expect(buildRelayConsentSummary(records)).toStrictEqual(buildRelayConsentSummary(records));
});

test('it rejects a record without a recorded status', () => {
  expect(() =>
    buildRelayConsentSummary([
      {
        action: 'push-main',
        label: 'risky',
        cell: 'absent',
        repeat: 1,
        gating: null,
        answers: null,
      },
    ]),
  ).toThrow();
});
