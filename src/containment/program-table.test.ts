import { expect, test } from 'bun:test';
import { PROGRAM_TABLE } from './program-table.ts';
import type { ProgramEntry, WriteRule } from './program-table.ts';

test('it names a finding for every rule that reads its targets as other than paths', () => {
  const entries: ProgramEntry[] = Object.values(PROGRAM_TABLE);
  const rules: WriteRule[] = [];

  while (entries.length > 0) {
    const entry = entries.pop();

    entries.push(
      ...Object.values(entry?.subcommands ?? {}),
      ...(entry?.otherSubcommand === undefined ? [] : [entry.otherSubcommand.entry]),
    );

    rules.push(...(entry?.writes ?? []));
  }

  expect(rules.filter((rule) => rule.role !== undefined && rule.role !== 'path')).toSatisfyAll(
    (rule: WriteRule) => rule.finding !== undefined,
  );
});
