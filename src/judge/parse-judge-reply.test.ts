import { expect, test } from 'bun:test';
import { parseJudgeReply } from './parse-judge-reply.ts';

test('it reads a confirm verdict with its reason', () => {
  expect(
    parseJudgeReply(
      'Looking at the action.\n<verdict>confirm</verdict>\n<reason>The push sends the key file.</reason>',
    ),
  ).toStrictEqual({ kind: 'confirm', reason: 'The push sends the key file.' });
});

test.each([['consent'], ['misread']] as const)(
  'it reads an overturn verdict with its %s basis and its reason',
  (basis) => {
    expect(
      parseJudgeReply(
        `<verdict>overturn</verdict><basis>${basis}</basis><reason>The user asked for this push.</reason>`,
      ),
    ).toStrictEqual({ kind: 'overturn', basis, reason: 'The user asked for this push.' });
  },
);

test('it reads the verdict and basis words in any case and trims the padding around them and the reason', () => {
  expect(
    parseJudgeReply(
      '<VERDICT> Overturn </VERDICT><Basis> Misread </Basis><Reason>\n  The task owns it.\n</Reason>',
    ),
  ).toStrictEqual({ kind: 'overturn', basis: 'misread', reason: 'The task owns it.' });
});

test('it reads an overturn without a basis as unreadable', () => {
  expect(
    parseJudgeReply('<verdict>overturn</verdict><reason>The user asked for this push.</reason>'),
  ).toStrictEqual({ kind: 'unreadable' });
});

test('it reads an overturn with two basis tags as unreadable', () => {
  expect(
    parseJudgeReply(
      '<verdict>overturn</verdict><basis>consent</basis><basis>misread</basis><reason>Fine.</reason>',
    ),
  ).toStrictEqual({ kind: 'unreadable' });
});

test('it reads an overturn with a basis other than consent or misread as unreadable', () => {
  expect(
    parseJudgeReply('<verdict>overturn</verdict><basis>policy</basis><reason>Fine.</reason>'),
  ).toStrictEqual({ kind: 'unreadable' });
});

test('it reads a confirm that carries a basis tag as a confirm', () => {
  expect(
    parseJudgeReply(
      '<verdict>confirm</verdict><basis>misread</basis><reason>It sends the key.</reason>',
    ),
  ).toStrictEqual({ kind: 'confirm', reason: 'It sends the key.' });
});

test('it reads a reply without a reason as unreadable', () => {
  expect(parseJudgeReply('<verdict>confirm</verdict>')).toStrictEqual({ kind: 'unreadable' });
});

test('it reads a reply with an empty reason as unreadable', () => {
  expect(parseJudgeReply('<verdict>confirm</verdict><reason>  \n </reason>')).toStrictEqual({
    kind: 'unreadable',
  });
});

test('it reads a reply with two verdict tags as unreadable, even when they agree', () => {
  expect(
    parseJudgeReply(
      '<verdict>overturn</verdict><verdict>overturn</verdict><basis>consent</basis><reason>Routine.</reason>',
    ),
  ).toStrictEqual({ kind: 'unreadable' });
});

test('it reads a reply with two reason tags as unreadable', () => {
  expect(
    parseJudgeReply('<verdict>confirm</verdict><reason>One.</reason><reason>Two.</reason>'),
  ).toStrictEqual({ kind: 'unreadable' });
});

test('it reads a verdict word other than confirm or overturn as unreadable', () => {
  expect(parseJudgeReply('<verdict>allow</verdict><reason>Looks fine.</reason>')).toStrictEqual({
    kind: 'unreadable',
  });
});

test('it reads a reply with no tags as unreadable', () => {
  expect(parseJudgeReply('I would overturn this deny.')).toStrictEqual({ kind: 'unreadable' });
});
