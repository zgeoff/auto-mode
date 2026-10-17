import { DecisionRequestError, sendDecision } from 'auto-mode/eval';
import type { DecisionRequest, ProviderConfig } from 'auto-mode/eval';
import invariant from 'tiny-invariant';
import type { CategoricalQuestion } from './build-categorical-questions.ts';
import { makeRecordingFetch } from './make-recording-fetch.ts';
import type { ResponseCopy } from './make-recording-fetch.ts';

export interface ShapeAnswer {
  readonly type: 'choice';
  readonly choice: string;
  readonly confidence: number;
  readonly probabilities: Readonly<Record<string, number>>;
}

export type ShapeOutcome =
  | {
      readonly kind: 'success';
      readonly model: string;
      readonly inputTokens: number;
      readonly answers: Readonly<Record<string, ShapeAnswer>>;
    }
  | { readonly kind: 'failure'; readonly reason: string; readonly detail?: unknown };

export interface SendShapeOptions {
  readonly state: DecisionRequest['state'];
  readonly questions: Readonly<Record<string, CategoricalQuestion>>;
  readonly signal: AbortSignal;
}

export async function sendShapeRequest(
  provider: ProviderConfig,
  key: string,
  options: Readonly<SendShapeOptions>,
): Promise<ShapeOutcome> {
  const [first, ...others] = Object.values(options.questions);

  invariant(first !== undefined, 'A shape asks at least one question.');

  const [choice, ...choices] = Object.keys(first.criteria);
  const choiceSet = JSON.stringify([choice, ...choices]);

  invariant(
    choice !== undefined &&
      others.every((question) => JSON.stringify(Object.keys(question.criteria)) === choiceSet),
    'Every question of a shape offers the same choices.',
  );

  const responses: ResponseCopy[] = [];

  try {
    const result = await sendDecision(
      provider,
      key,
      { state: options.state, questions: options.questions },
      {
        signal: options.signal,
        choices: [choice, ...choices],
        fetch: makeRecordingFetch(fetch, { redirect: 'manual', responses }),
      },
    );

    return {
      kind: 'success',
      model: result.model,
      inputTokens: result.inputTokens,
      answers: result.answers,
    };
  } catch (error) {
    const response = responses.at(-1);

    if (!(error instanceof DecisionRequestError) || error.reason === 'network') {
      return { kind: 'failure', reason: 'network' };
    }

    if (error.reason === 'aborted') {
      return { kind: 'failure', reason: 'timeout' };
    }

    if (error.reason === 'http-status' && response !== undefined) {
      return {
        kind: 'failure',
        reason:
          response.status >= 300 && response.status < 400 ? 'redirect' : `http-${response.status}`,
      };
    }

    // Jev answers hold only probabilities, so keeping a rejected body costs
    // nothing and is the only evidence of why it failed.
    const detail = response === undefined ? null : await response.text().catch(() => null);

    return { kind: 'failure', reason: error.reason, detail };
  }
}
