import { expect, test } from 'bun:test';
import { makeQuoteRemover } from './make-quote-remover.ts';

test('it replaces a run of five words copied from a message with one placeholder', () => {
  const removeQuotes = makeQuoteRemover(
    ['Please tidy the parser and keep every fixture as it is.'],
    'salt',
  );

  expect(
    removeQuotes('The user said to keep every fixture as it is, so this edit is out.'),
  ).toSatisfy((value: string) =>
    /^The user said to message-[0-9a-f]{8}, so this edit is out\.$/u.test(value),
  );
});

test('it keeps a run of four words copied from a message', () => {
  const removeQuotes = makeQuoteRemover(
    ['Please tidy the parser and keep every fixture as it is.'],
    'salt',
  );

  expect(removeQuotes('It will keep every fixture as requested.')).toBe(
    'It will keep every fixture as requested.',
  );
});

test('it matches a quote across case, quotation marks and sentence punctuation', () => {
  const removeQuotes = makeQuoteRemover(['Rename the queue worker before Friday.'], 'salt');

  expect(removeQuotes('The task says "rename the Queue worker before friday".')).toSatisfy(
    (value: string) => /^The task says "message-[0-9a-f]{8}"\.$/u.test(value),
  );
});

test('it joins overlapping copied runs into one placeholder', () => {
  const removeQuotes = makeQuoteRemover(
    ['one two three four five six seven', 'five six seven eight nine ten'],
    'salt',
  );

  expect(removeQuotes('one two three four five six seven eight nine ten')).toSatisfy(
    (value: string) => /^message-[0-9a-f]{8}$/u.test(value),
  );
});

test('it gives the same quote the same placeholder', () => {
  const removeQuotes = makeQuoteRemover(['Ship the lantern release notes tonight.'], 'salt');

  expect(removeQuotes('a: ship the lantern release notes')).toBe(
    removeQuotes('b: ship the lantern release notes').replace(/^b/u, 'a'),
  );
});

test('it leaves text unchanged when there are no messages', () => {
  expect(makeQuoteRemover([], 'salt')('one two three four five six')).toBe(
    'one two three four five six',
  );
});
