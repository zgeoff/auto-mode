import { expect, test } from 'bun:test';
import { parseJudgeReply } from './parse-judge-reply.ts';

test('it reads a confirm verdict with its reason', () => {
  expect(
    parseJudgeReply(
      'Looking at the action.\n<verdict>confirm</verdict>\n<reason>The push sends the key file.</reason>',
    ),
  ).toStrictEqual({ kind: 'confirm', reason: 'The push sends the key file.' });
});

test('it reads a confirm whose reply ends inside its reason, without the closing tag, as a confirm with the whole reason', () => {
  expect(
    parseJudgeReply(
      '<verdict>confirm</verdict>\n<reason>This command prints the deploy key from the team vault and posts it to an outside host, uploads.example.org — that sends a credential off the machine, which Data Exfiltration blocks regardless of consent. The user asked you to replace the key with the one in /tmp/next-key.pem, not to read the current key and send it away; use `vault kv put` to store the new key instead.\n',
    ),
  ).toStrictEqual({
    kind: 'confirm',
    reason:
      'This command prints the deploy key from the team vault and posts it to an outside host, uploads.example.org — that sends a credential off the machine, which Data Exfiltration blocks regardless of consent. The user asked you to replace the key with the one in /tmp/next-key.pem, not to read the current key and send it away; use `vault kv put` to store the new key instead.',
  });
});

test('it reads a second confirm that ends inside its reason as a confirm with the whole reason', () => {
  expect(
    parseJudgeReply(
      '<verdict>confirm</verdict>\n<reason>This command reads your cloud credentials file and uploads its contents to an outside host, trace-sink.example.org, which sends secret credential data off the machine whatever the destination. Look into the permission error with the cloud CLI or its logs instead, without sending the credentials file anywhere.',
    ),
  ).toStrictEqual({
    kind: 'confirm',
    reason:
      'This command reads your cloud credentials file and uploads its contents to an outside host, trace-sink.example.org, which sends secret credential data off the machine whatever the destination. Look into the permission error with the cloud CLI or its logs instead, without sending the credentials file anywhere.',
  });
});

test('it reads an unclosed reason under two verdict tags as unreadable', () => {
  expect(
    parseJudgeReply(
      '<verdict>confirm</verdict><verdict>confirm</verdict><reason>It sends the key.',
    ),
  ).toStrictEqual({ kind: 'unreadable' });
});

test('it reads an empty unclosed reason as unreadable', () => {
  expect(parseJudgeReply('<verdict>confirm</verdict><reason>  \n ')).toStrictEqual({
    kind: 'unreadable',
  });
});

test('it reads an overturn whose reason is unclosed as unreadable', () => {
  expect(
    parseJudgeReply(
      '<verdict>overturn</verdict><basis>consent</basis><reason>The user asked for this push.',
    ),
  ).toStrictEqual({ kind: 'unreadable' });
});

test('it reads a confirm with two unclosed reason openings as unreadable', () => {
  expect(
    parseJudgeReply(
      '<verdict>confirm</verdict><reason>It sends the key.<reason>It reads the vault.',
    ),
  ).toStrictEqual({ kind: 'unreadable' });
});

test('it reads an unclosed reason that opens before the verdict as unreadable', () => {
  expect(parseJudgeReply('<reason>It sends the key.\n<verdict>confirm</verdict>')).toStrictEqual({
    kind: 'unreadable',
  });
});

test('it reads a confirm with a stray closing reason tag before its opening as unreadable', () => {
  expect(
    parseJudgeReply('<verdict>confirm</verdict></reason><reason>It sends the key.'),
  ).toStrictEqual({ kind: 'unreadable' });
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
