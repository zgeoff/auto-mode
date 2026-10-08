import { faker } from '@faker-js/faker';
import type { DecisionRulesCase } from '../load-decision-rules-cases.ts';

interface DecisionRulesCaseOverrides extends Partial<Omit<DecisionRulesCase, 'repository'>> {
  readonly repository?: Partial<DecisionRulesCase['repository']>;
}

export function buildMockDecisionRulesCase(
  overrides: DecisionRulesCaseOverrides = {},
): DecisionRulesCase {
  const { repository, ...rest } = overrides;

  return {
    id: faker.string.alphanumeric(8),
    severity: 'safe',
    tool: 'Bash',
    input: { command: faker.lorem.words(3) },
    cwd: `/${faker.system.directoryPath().replaceAll(/^\/+/g, '')}`,
    ...rest,
    repository: { branch: faker.git.branch(), defaultBranch: faker.git.branch(), ...repository },
  };
}
