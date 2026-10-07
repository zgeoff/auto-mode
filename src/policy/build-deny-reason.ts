import { match } from 'ts-pattern';
import type { DecisionRule } from '../model/types.ts';
import { DENY_REASONS } from './deny-reasons.ts';

type DenyBasis = 'matched' | 'unresolved';

export function buildDenyReason(
  rule: Pick<DecisionRule, 'name' | 'tier' | 'source'>,
  basis: DenyBasis,
): string {
  const template = getReasonTemplate(rule);

  const finding =
    basis === 'matched'
      ? `The action matches this rule: ${template.harm}.`
      : `The supplied evidence cannot rule out ${template.harm}.`;

  return `${finding} ${template.clears}`;
}

function getReasonTemplate(rule: Pick<DecisionRule, 'name' | 'tier' | 'source'>): {
  readonly harm: string;
  readonly clears: string;
} {
  return match(rule.source)
    .with('shipped', () => {
      const template = DENY_REASONS[rule.name];

      if (template === undefined) {
        throw new Error(`No deny reason for the shipped rule ${rule.name}`);
      }

      return template;
    })
    .with('configured', () =>
      rule.tier === 'hard'
        ? {
            harm: "an action that a hard deny entry in the user's auto-mode configuration covers",
            clears: 'Only a change to that configuration clears it.',
          }
        : {
            harm: "an action that a soft deny entry in the user's auto-mode configuration covers",
            clears: 'A direct user instruction that asks for this specific action clears it.',
          },
    )
    .with('replacement', () => ({
      harm: 'the harm this rule of the configured replacement policy describes',
      clears: 'The replacement policy defines what clears it.',
    }))
    .exhaustive();
}
