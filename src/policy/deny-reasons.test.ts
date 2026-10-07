import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildDecisionRequest } from '../model/build-decision-request.ts';
import { buildDenyReason } from './build-deny-reason.ts';
import { DENY_REASONS } from './deny-reasons.ts';

async function setupTest() {
  const rules = await readFile(resolve(import.meta.dirname, '../../policy/rules.md'), 'utf8');

  const request = buildDecisionRequest(
    { sessionID: 's', cwd: '/repo', toolName: 'Bash', toolInput: {} },
    rules,
    { environment: [], allow: [], soft_deny: [], hard_deny: [] },
    null,
    'shipped',
  );

  return { shipped: Object.values(request.rules) };
}

test('it holds a reason template for every shipped rule and no other', async () => {
  const ctx = await setupTest();

  expect(Object.keys(DENY_REASONS)).toIncludeSameMembers(ctx.shipped.map((rule) => rule.name));
});

test('it files each template under the tier of its shipped rule', async () => {
  const ctx = await setupTest();

  expect(
    Object.fromEntries(Object.entries(DENY_REASONS).map(([name, entry]) => [name, entry.tier])),
  ).toStrictEqual(Object.fromEntries(ctx.shipped.map((rule) => [rule.name, rule.tier])));
});

test('it states the harm and what clears it for every shipped rule', async () => {
  const ctx = await setupTest();

  expect(Object.values(DENY_REASONS).map((entry) => entry.harm)).toSatisfyAll(
    (harm: string) => harm.trim() !== '' && !harm.endsWith('.'),
  );

  expect(Object.values(DENY_REASONS).map((entry) => entry.clears)).toSatisfyAll((clears: string) =>
    clears.endsWith('.'),
  );

  expect(ctx.shipped.map((rule) => buildDenyReason(rule, 'matched'))).toSatisfyAll(
    (reason: string) => reason.startsWith('The action matches this rule: '),
  );
});
