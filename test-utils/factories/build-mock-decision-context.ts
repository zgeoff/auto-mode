import { faker } from '@faker-js/faker';
import type { DecisionContext } from '../../src/request/types.ts';

type UserTask = NonNullable<DecisionContext['originalUserTask']>;

type DelegatedTask = NonNullable<DecisionContext['delegatedTask']>;

type DirectUserMessage = NonNullable<DecisionContext['lastDirectUserMessage']>;

interface DecisionContextOverrides extends Partial<
  Omit<DecisionContext, 'originalUserTask' | 'delegatedTask' | 'lastDirectUserMessage'>
> {
  readonly originalUserTask?: Partial<UserTask> | null;
  readonly delegatedTask?: Partial<DelegatedTask> | null;
  readonly lastDirectUserMessage?: Partial<DirectUserMessage> | null;
}

// The main agent with no delegated task and no direct user message: each of
// those changes which evidence the classifier treats as consent, so a test opts
// into them. The original task is arbitrary context.
export function buildMockDecisionContext(
  overrides: DecisionContextOverrides = {},
): DecisionContext {
  const { originalUserTask, delegatedTask, lastDirectUserMessage, ...rest } = overrides;

  return {
    agentID: null,
    omittedTaskContext: [],
    ...rest,
    originalUserTask:
      originalUserTask === null
        ? null
        : { text: faker.lorem.sentence(), origin: 'composer', ...originalUserTask },
    delegatedTask:
      delegatedTask === undefined || delegatedTask === null
        ? null
        : { text: faker.lorem.sentence(), origin: 'agent.spawn', ...delegatedTask },
    lastDirectUserMessage:
      lastDirectUserMessage === undefined || lastDirectUserMessage === null
        ? null
        : { text: faker.lorem.sentence(), origin: 'composer', ...lastDirectUserMessage },
  };
}
