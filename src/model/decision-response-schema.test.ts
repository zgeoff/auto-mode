import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { decisionResponseSchema } from './decision-response-schema.ts';

test('it accepts a complete decision response', () => {
  const payload = {
    model: 'jev-1.13.0',
    answers: {
      rule_0: {
        type: 'choice',
        choice: 'block',
        confidence: 0.9,
        probabilities: { allow: 0.1, block: 0.9, ask: 0 },
      },
    },
    usage: { input_tokens: 400 },
  } as const;

  const result = decisionResponseSchema.safeParse(payload);

  expect(result.data).toStrictEqual(payload);
});

test('it drops usage counts beyond the input tokens', () => {
  const result = decisionResponseSchema.safeParse({
    model: 'jev-1.13.0',
    answers: {
      rule_0: {
        type: 'choice',
        choice: 'block',
        confidence: 0.9,
        probabilities: { allow: 0.1, block: 0.9, ask: 0 },
      },
    },
    usage: { input_tokens: 400, output_tokens: 10 },
  });

  expect(result.data).toStrictEqual({
    model: 'jev-1.13.0',
    answers: {
      rule_0: {
        type: 'choice',
        choice: 'block',
        confidence: 0.9,
        probabilities: { allow: 0.1, block: 0.9, ask: 0 },
      },
    },
    usage: { input_tokens: 400 },
  });
});

test.each([
  [
    'an empty model name',
    {
      model: '',
      answers: {
        rule_0: {
          type: 'choice',
          choice: 'block',
          confidence: 0.9,
          probabilities: { allow: 0.1, block: 0.9, ask: 0 },
        },
      },
      usage: { input_tokens: 400 },
    },
    ['model'],
  ],
  [
    'an unknown choice',
    {
      model: 'jev-1.13.0',
      answers: {
        rule_0: {
          type: 'choice',
          choice: 'ignore',
          confidence: 0.9,
          probabilities: { allow: 0.1, block: 0.9, ask: 0 },
        },
      },
      usage: { input_tokens: 400 },
    },
    ['answers', 'rule_0', 'choice'],
  ],
  [
    'a confidence above 1',
    {
      model: 'jev-1.13.0',
      answers: {
        rule_0: {
          type: 'choice',
          choice: 'block',
          confidence: 1.5,
          probabilities: { allow: 0.1, block: 0.9, ask: 0 },
        },
      },
      usage: { input_tokens: 400 },
    },
    ['answers', 'rule_0', 'confidence'],
  ],
  [
    'a probability for an unknown choice',
    {
      model: 'jev-1.13.0',
      answers: {
        rule_0: {
          type: 'choice',
          choice: 'block',
          confidence: 0.9,
          probabilities: { allow: 0.1, block: 0.9, ask: 0, ignore: 0 },
        },
      },
      usage: { input_tokens: 400 },
    },
    ['answers', 'rule_0', 'probabilities'],
  ],
  [
    'a negative input token count',
    {
      model: 'jev-1.13.0',
      answers: {
        rule_0: {
          type: 'choice',
          choice: 'block',
          confidence: 0.9,
          probabilities: { allow: 0.1, block: 0.9, ask: 0 },
        },
      },
      usage: { input_tokens: -1 },
    },
    ['usage', 'input_tokens'],
  ],
])('it rejects a response with %s', (_label, payload, path) => {
  const result = decisionResponseSchema.safeParse(payload);

  invariant(result.error, 'the payload is rejected');

  expect(result.error.issues).toPartiallyContain({ path });
});
