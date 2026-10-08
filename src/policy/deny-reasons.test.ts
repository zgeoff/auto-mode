import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildMockActionRequest } from '../../test-utils/factories/build-mock-action-request.ts';
import { buildMockClaudeRules } from '../../test-utils/factories/build-mock-claude-rules.ts';
import { buildDecisionRequest } from '../model/build-decision-request.ts';
import { DENY_REASONS } from './deny-reasons.ts';

test('it holds a reason template for every shipped rule and no other', async () => {
  const policy = await readFile(join(import.meta.dirname, '../../policy/rules.md'), 'utf8');

  const request = buildDecisionRequest(
    buildMockActionRequest(),
    policy,
    buildMockClaudeRules(),
    null,
    'shipped',
  );

  expect(Object.keys(DENY_REASONS)).toIncludeSameMembers(
    Object.values(request.rules).map((rule) => rule.name),
  );
});

test('it files each template under the tier of its shipped rule', async () => {
  const policy = await readFile(join(import.meta.dirname, '../../policy/rules.md'), 'utf8');

  const request = buildDecisionRequest(
    buildMockActionRequest(),
    policy,
    buildMockClaudeRules(),
    null,
    'shipped',
  );

  expect(
    Object.fromEntries(Object.entries(DENY_REASONS).map(([name, entry]) => [name, entry.tier])),
  ).toStrictEqual(
    Object.fromEntries(Object.values(request.rules).map((rule) => [rule.name, rule.tier])),
  );
});

// The harm is spliced mid-sentence and the clearing condition ends the reason.
test('it states each harm as a clause without a closing period', () => {
  expect(Object.values(DENY_REASONS).map((entry) => entry.harm)).toSatisfyAll(
    (harm: string) => harm.trim() !== '' && !harm.endsWith('.'),
  );
});

test('it states each clearing condition as a full sentence', () => {
  expect(Object.values(DENY_REASONS).map((entry) => entry.clears)).toSatisfyAll((clears: string) =>
    clears.endsWith('.'),
  );
});
