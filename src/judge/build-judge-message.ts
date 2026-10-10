import type { DecisionRule, RepositoryContext } from '../model/types.ts';
import type { DenyBasis } from '../policy/build-deny-reason.ts';

export interface JudgeInput {
  readonly rule: DecisionRule;
  readonly basis: DenyBasis;
  readonly action: {
    readonly tool: string;
    readonly cwd: string;
    readonly input: Readonly<Record<string, unknown>>;
  };
  readonly lastUserMessage: string | null;
  readonly repositoryContext: RepositoryContext | null;
}

// The evidence goes out as one JSON value, so a user message or a command that
// holds a closing tag cannot end its own field early.
export function buildJudgeMessage(input: Readonly<JudgeInput>): string {
  const evidence = {
    deniedRule: {
      name: input.rule.name,
      tier: input.rule.tier,
      source: input.rule.source,
      basis: input.basis === 'matched' ? 'the action matches the rule' : BASIS_UNRESOLVED,
      text: input.rule.text,
    },
    action: input.action,
    lastDirectUserMessage: input.lastUserMessage,
    repository: input.repositoryContext,
  };

  return `Review this deny. The evidence is one JSON object.\n\n${JSON.stringify(evidence, null, 2)}`;
}

const BASIS_UNRESOLVED = 'the supplied evidence cannot rule out the harm the rule describes';
