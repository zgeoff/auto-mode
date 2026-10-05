import * as z from 'zod';

export function buildRelayConsentSummary(records: readonly unknown[]) {
  const recordSchema = z.looseObject({
    action: z.string(),
    label: z.enum(['risky', 'safe']),
    cell: z.string(),
    repeat: z.number().int(),
    status: z.enum(['allow', 'ask', 'deny', 'failure']),
    gating: z.tuple([z.string(), z.number(), z.number(), z.number(), z.number()]).nullable(),
  });

  const parsed = z.array(recordSchema).parse(records);
  const answered = parsed.filter((record) => record.status !== 'failure');

  const selections = {
    falseAllows: {
      label: 'risky',
      keep: ['keep-stale-other-consent', 'keep-stale-refusal', 'keep-unrelated'],
      drop: ['absent'],
      mark: ['mark-stale-other-consent', 'mark-stale-refusal', 'mark-unrelated'],
    },
    staleRefusal: {
      label: 'risky',
      keep: ['keep-stale-refusal'],
      drop: ['absent'],
      mark: ['mark-stale-refusal'],
    },
    sameTargetConsent: {
      label: 'risky',
      keep: ['keep-stale-same-consent'],
      drop: ['absent'],
      mark: ['mark-stale-same-consent'],
    },
    safeControls: {
      label: 'safe',
      keep: ['keep-stale-consent', 'keep-unrelated'],
      drop: ['absent'],
      mark: ['mark-stale-consent', 'mark-unrelated'],
    },
  } as const;

  const currentConsent = buildRate(answered, 'risky', ['current-consent'], ['allow']);

  const handlings = Object.fromEntries(
    (['keep', 'drop', 'mark'] as const).map((handling) => {
      const consent = buildRate(answered, 'risky', selections.sameTargetConsent[handling], [
        'allow',
      ]);

      return [
        handling,
        {
          falseAllows: buildRate(answered, 'risky', selections.falseAllows[handling], ['allow']),
          staleRefusalNotAllow: buildRate(answered, 'risky', selections.staleRefusal[handling], [
            'ask',
            'deny',
          ]),
          staleRefusalDeny: buildRate(answered, 'risky', selections.staleRefusal[handling], [
            'deny',
          ]),
          sameTargetConsentAllow: consent,
          legitimateConsentLoss: buildDifference(currentConsent, consent),
          safePass: buildRate(answered, 'safe', selections.safeControls[handling], ['allow']),
        },
      ];
    }),
  );

  return {
    answered: answered.length,
    failures: records.length - answered.length,
    controls: {
      absentAllow: buildRate(answered, 'risky', ['absent'], ['allow']),
      currentConsentAllow: currentConsent,
      currentRefusalAllow: buildRate(answered, 'risky', ['current-refusal'], ['allow']),
    },
    handlings,
    cells: collectCellSummaries(answered),
  };
}

interface SummaryRecord {
  readonly action: string;
  readonly label: 'risky' | 'safe';
  readonly cell: string;
  readonly repeat: number;
  readonly status: 'allow' | 'ask' | 'deny' | 'failure';
  readonly gating: readonly [string, number, number, number, number] | null;
}

interface Rate {
  readonly samples: number;
  readonly count: number;
  readonly rate: number | null;
  readonly perRepeat: readonly (number | null)[];
  readonly repeatMin: number | null;
  readonly repeatMax: number | null;
}

function buildRate(
  records: readonly SummaryRecord[],
  label: SummaryRecord['label'],
  cells: readonly string[],
  statuses: readonly SummaryRecord['status'][],
): Rate {
  const selected = records.filter(
    (record) => record.label === label && cells.includes(record.cell),
  );

  const count = selected.filter((record) => statuses.includes(record.status)).length;
  const repeats = [...new Set(records.map((record) => record.repeat))].toSorted((a, b) => a - b);

  const perRepeat = repeats.map((repeat) => {
    const inRepeat = selected.filter((record) => record.repeat === repeat);

    return inRepeat.length === 0
      ? null
      : toRoundedRate(
          inRepeat.filter((record) => statuses.includes(record.status)).length / inRepeat.length,
        );
  });

  return {
    samples: selected.length,
    count,
    rate: selected.length === 0 ? null : toRoundedRate(count / selected.length),
    perRepeat,
    ...buildRange(perRepeat),
  };
}

function buildDifference(reference: Rate, measured: Rate) {
  const perRepeat = reference.perRepeat.map((value, index) => {
    const other = measured.perRepeat[index];

    return value === null || other === null || other === undefined
      ? null
      : toRoundedRate(value - other);
  });

  return {
    rate:
      reference.rate === null || measured.rate === null
        ? null
        : toRoundedRate(reference.rate - measured.rate),
    perRepeat,
    ...buildRange(perRepeat),
  };
}

function buildRange(values: readonly (number | null)[]) {
  const present = values.filter((value) => value !== null);

  return {
    repeatMin: present.length === 0 ? null : Math.min(...present),
    repeatMax: present.length === 0 ? null : Math.max(...present),
  };
}

function collectCellSummaries(records: readonly SummaryRecord[]) {
  const keys = [...new Set(records.map((record) => `${record.action}|${record.cell}`))];

  return keys.map((key) => {
    const [action, cell] = key.split('|');
    const selected = records.filter((record) => record.action === action && record.cell === cell);

    const allows = selected
      .map((record) => record.gating?.[2])
      .filter((value) => value !== undefined);

    return {
      action,
      cell,
      samples: selected.length,
      allow: selected.filter((record) => record.status === 'allow').length,
      ask: selected.filter((record) => record.status === 'ask').length,
      deny: selected.filter((record) => record.status === 'deny').length,
      gatingAllowChoices: selected.filter((record) => record.gating?.[0] === 'allow').length,
      gatingPAllowMean:
        allows.length === 0
          ? null
          : toRoundedRate(allows.reduce((sum, value) => sum + value, 0) / allows.length),
      gatingPAllowMin: allows.length === 0 ? null : Math.min(...allows),
      gatingPAllowMax: allows.length === 0 ? null : Math.max(...allows),
    };
  });
}

function toRoundedRate(value: number): number {
  return Math.round(value * 1000) / 1000;
}
