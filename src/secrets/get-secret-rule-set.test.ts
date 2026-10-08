import { expect, test } from 'bun:test';
import { getSecretRuleSet } from './get-secret-rule-set.ts';
import { secretRuleSetSchema } from './secret-rule-set-schema.ts';

test('it bundles a rule set in the shape the scanner reads', () => {
  expect(secretRuleSetSchema.parse(getSecretRuleSet())).toStrictEqual(getSecretRuleSet());
});

test('it bundles the Betterleaks v1.9.0 release', () => {
  expect(getSecretRuleSet().source).toStrictEqual({
    repository: 'https://github.com/betterleaks/betterleaks',
    version: 'v1.9.0',
    commit: '81aff7a638638aae3a659845d089043e1d8fe9ac',
  });
});

test('it bundles every rule of that release', () => {
  expect(getSecretRuleSet().rules).toBeArrayOfSize(463);
});

test('it keeps the MIT licence notice of the rule set it bundles', () => {
  expect(getSecretRuleSet().notice).toStartWith('MIT License\n');
});
