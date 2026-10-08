import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildMockActionRequest } from '../../test-utils/factories/build-mock-action-request.ts';
import { buildMockClaudeRules } from '../../test-utils/factories/build-mock-claude-rules.ts';
import { buildMockDecisionRule } from '../../test-utils/factories/build-mock-decision-rule.ts';
import { buildDecisionRequest } from '../model/build-decision-request.ts';
import { buildDenyReason } from './build-deny-reason.ts';

test('it renders a matched reason from the template of a shipped rule', () => {
  const rule = buildMockDecisionRule({
    name: 'Publish and Release',
    tier: 'soft',
    source: 'shipped',
  });

  expect(buildDenyReason(rule, 'matched')).toBe(
    'The action matches this rule: putting an artifact where other people install it. A direct user instruction that says publish, release, or deploy and names the target clears it.',
  );
});

test('it renders an unresolved reason from the same template', () => {
  const rule = buildMockDecisionRule({
    name: 'Publish and Release',
    tier: 'soft',
    source: 'shipped',
  });

  expect(buildDenyReason(rule, 'unresolved')).toBe(
    'The supplied evidence cannot rule out putting an artifact where other people install it. A direct user instruction that says publish, release, or deploy and names the target clears it.',
  );
});

test('it states that nothing clears a shipped hard rule without a clarification path', () => {
  const rule = buildMockDecisionRule({
    name: 'Data Exfiltration',
    tier: 'hard',
    source: 'shipped',
  });

  expect(buildDenyReason(rule, 'matched')).toBe(
    'The action matches this rule: sending sensitive data, such as credentials or private code, off the machine. No instruction or configuration clears this rule.',
  );
});

test('it renders a matched reason for every rule the shipped policy names', async () => {
  const policy = await readFile(join(import.meta.dirname, '../../policy/rules.md'), 'utf8');

  const request = buildDecisionRequest(
    buildMockActionRequest(),
    policy,
    buildMockClaudeRules(),
    null,
    'shipped',
  );

  expect(Object.values(request.rules).map((rule) => buildDenyReason(rule, 'matched'))).toSatisfyAll(
    (reason: string) => reason.startsWith('The action matches this rule: '),
  );
});

test('it gives a configured hard deny entry a reason that only configuration clears', () => {
  const rule = buildMockDecisionRule({ tier: 'hard', source: 'configured' });

  expect(buildDenyReason(rule, 'matched')).toBe(
    "The action matches this rule: an action that a hard deny entry in the user's auto-mode configuration covers. Only a change to that configuration clears it.",
  );
});

test('it gives a configured soft deny entry a reason that a specific instruction clears', () => {
  const rule = buildMockDecisionRule({ tier: 'soft', source: 'configured' });

  expect(buildDenyReason(rule, 'unresolved')).toBe(
    "The supplied evidence cannot rule out an action that a soft deny entry in the user's auto-mode configuration covers. A direct user instruction that asks for this specific action clears it.",
  );
});

test('it defers to the replacement policy for what a replacement rule guards and what clears it', () => {
  const rule = buildMockDecisionRule({ source: 'replacement' });

  expect(buildDenyReason(rule, 'matched')).toBe(
    'The action matches this rule: the harm this rule of the configured replacement policy describes. The replacement policy defines what clears it.',
  );
});

test('it throws for a shipped rule name that has no template', () => {
  const rule = buildMockDecisionRule({ name: 'Unknown Rule', source: 'shipped' });

  expect(() => buildDenyReason(rule, 'matched')).toThrowWithMessage(
    Error,
    /No deny reason for the shipped rule Unknown Rule/u,
  );
});
