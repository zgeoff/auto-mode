import { expect, test } from 'bun:test';
import { PROGRAM_TABLE } from './program-table.ts';
import type { ProgramEntry, WriteRule } from './program-table.ts';

test('it names a finding for every rule whose role yields the rule finding', () => {
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

  const roles = new Set([
    'remote-path',
    'url',
    'remote-command',
    'commit',
    'pull-request',
    'pull-request-merge',
    'forge-path',
  ]);

  expect(rules.filter((rule) => roles.has(rule.role ?? 'path'))).toSatisfyAll(
    (rule: WriteRule) => rule.finding !== undefined,
  );
});
