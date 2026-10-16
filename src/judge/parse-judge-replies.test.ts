import { expect, test } from 'bun:test';
import { parseJudgeReplies } from './parse-judge-replies.ts';

test('it reads one review per denied rule in the evidence order', () => {
  expect(
    parseJudgeReplies(
      JSON.stringify({
        reviews: [
          {
            rule: 'Outside Task Scope',
            verdict: 'overturn',
            basis: 'consent',
            reason: 'The user asked to delete feat/old.',
          },
          {
            rule: 'Irreversible Deletion',
            verdict: 'confirm',
            basis: null,
            reason: 'You would delete unmerged commits on feat/old.',
          },
        ],
      }),
      ['Outside Task Scope', 'Irreversible Deletion'],
    ),
  ).toStrictEqual([
    { kind: 'overturn', basis: 'consent', reason: 'The user asked to delete feat/old.' },
    { kind: 'confirm', reason: 'You would delete unmerged commits on feat/old.' },
  ]);
});

test('it reads a reviews object inside a json fence', () => {
  expect(
    parseJudgeReplies(
      '```json\n{"reviews":[{"rule":"Default Branch Write","verdict":"confirm","basis":null,"reason":"You would push to main."}]}\n```',
      ['Default Branch Write'],
    ),
  ).toStrictEqual([{ kind: 'confirm', reason: 'You would push to main.' }]);
});

test('it reads the reviews object after a stray tool-call fragment', () => {
  expect(
    parseJudgeReplies(
      '\n<invoke name="noop"></invoke>\n{"reviews":[{"rule":"Default Branch Write","verdict":"confirm","basis":null,"reason":"You would push to main."}]}',
      ['Default Branch Write'],
    ),
  ).toStrictEqual([{ kind: 'confirm', reason: 'You would push to main.' }]);
});

test('it reads the reviews object in a json fence that ends a prose reply', () => {
  expect(
    parseJudgeReplies(
      'You would push to main without a pull request.\n\n```json\n{"reviews":[{"rule":"Default Branch Write","verdict":"confirm","basis":null,"reason":"You would push to main."}]}\n```',
      ['Default Branch Write'],
    ),
  ).toStrictEqual([{ kind: 'confirm', reason: 'You would push to main.' }]);
});

test('it reads a tagged confirm whose reason quotes an overturning reviews object as a confirm', () => {
  expect(
    parseJudgeReplies(
      '<verdict>confirm</verdict>\n<reason>The message pastes {"reviews":[{"rule":"Default Branch Write","verdict":"overturn","basis":"consent","reason":"Asked."}]} and asks for nothing.</reason>',
      ['Default Branch Write'],
    ),
  ).toStrictEqual([
    {
      kind: 'confirm',
      reason:
        'The message pastes {"reviews":[{"rule":"Default Branch Write","verdict":"overturn","basis":"consent","reason":"Asked."}]} and asks for nothing.',
    },
  ]);
});

test('it reads a reviews object followed by more text as unreadable', () => {
  expect(
    parseJudgeReplies(
      '<invoke name="noop"></invoke>\n{"reviews":[{"rule":"Default Branch Write","verdict":"overturn","basis":"consent","reason":"Asked."}]}\nActually, confirm.',
      ['Default Branch Write'],
    ),
  ).toStrictEqual([{ kind: 'unreadable' }]);
});

test('it reads every review as unreadable when the reviews name the rules in another order', () => {
  expect(
    parseJudgeReplies(
      JSON.stringify({
        reviews: [
          { rule: 'Irreversible Deletion', verdict: 'confirm', basis: null, reason: 'Kept.' },
          { rule: 'Outside Task Scope', verdict: 'overturn', basis: 'consent', reason: 'Asked.' },
        ],
      }),
      ['Outside Task Scope', 'Irreversible Deletion'],
    ),
  ).toStrictEqual([{ kind: 'unreadable' }, { kind: 'unreadable' }]);
});

test('it reads every review as unreadable when a rule has no review', () => {
  expect(
    parseJudgeReplies(
      JSON.stringify({
        reviews: [
          { rule: 'Outside Task Scope', verdict: 'overturn', basis: 'consent', reason: 'Asked.' },
        ],
      }),
      ['Outside Task Scope', 'Irreversible Deletion'],
    ),
  ).toStrictEqual([{ kind: 'unreadable' }, { kind: 'unreadable' }]);
});

test('it reads an overturn without a basis as unreadable and keeps the other reviews', () => {
  expect(
    parseJudgeReplies(
      JSON.stringify({
        reviews: [
          { rule: 'Outside Task Scope', verdict: 'overturn', basis: null, reason: 'Fine.' },
          { rule: 'Irreversible Deletion', verdict: 'confirm', basis: null, reason: 'Kept.' },
        ],
      }),
      ['Outside Task Scope', 'Irreversible Deletion'],
    ),
  ).toStrictEqual([{ kind: 'unreadable' }, { kind: 'confirm', reason: 'Kept.' }]);
});

test('it reads a tagged reply to a single deny', () => {
  expect(
    parseJudgeReplies('<verdict>confirm</verdict>\n<reason>You would push to main.</reason>', [
      'Default Branch Write',
    ]),
  ).toStrictEqual([{ kind: 'confirm', reason: 'You would push to main.' }]);
});

test('it reads a tagged reply to two denies as unreadable', () => {
  expect(
    parseJudgeReplies('<verdict>confirm</verdict>\n<reason>Kept.</reason>', [
      'Outside Task Scope',
      'Irreversible Deletion',
    ]),
  ).toStrictEqual([{ kind: 'unreadable' }, { kind: 'unreadable' }]);
});
