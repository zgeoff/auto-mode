import { match } from 'ts-pattern';
import { forEachChild, parse } from 'unbash';
import type {
  Assignment,
  Command,
  CommandNode,
  CompoundList,
  ParseError,
  PipelineNode,
  Redirection,
  Statement,
  SyntaxNode,
  Word,
} from 'unbash';
import type {
  ShellCommandTree,
  ShellRedirect,
  ShellScope,
  ShellSegment,
  ShellWord,
} from './types.ts';

// Each simple command is one segment, wherever the tree nests it. A compound
// command's own words and redirections form a segment with no words, and a
// substitution's commands belong to no segment.
export function parseShellCommand(command: string): ShellCommandTree {
  const script = parse(command);
  const errors = collectParseErrors(script);

  // Only the top script's errors index the command text: a backtick's script
  // indexes its own unescaped text.
  const topErrors = script.errors ?? [];
  const blanked = blankUnexpectedTokens(command, topErrors);
  const tree = blanked === command ? script : parse(blanked);
  const quoteErrors = topErrors.filter((error) => isQuoteError(error));
  const walk = buildWalk(command, errors, quoteErrors);

  for (const statement of tree.commands) {
    walk.readStatement(statement);
  }

  return {
    segments: walk.segments,
    hasError: errors.length > 0,
    hasSubstitution: hasSubstitutionNode(script),
    hasCompound: walk.hasCompound,
    hasPipe: walk.hasPipe,
  };
}

// unbash keeps the errors of a substitution's script on that script, and
// resolves each script only when it is first read.
function collectParseErrors(node: SyntaxNode): ParseError[] {
  const errors: ParseError[] = [];

  const visit = (child: SyntaxNode): void => {
    if (child.type === 'Script') {
      errors.push(...(child.errors ?? []));
    }

    // An arithmetic body unbash cannot read can hide a substitution.
    if (child.type === 'ArithmeticCommand' || child.type === 'ArithmeticExpansion') {
      const body = child.type === 'ArithmeticCommand' ? child.body : child.text.slice(3, -2);

      if (child.expression === undefined && /\S/u.test(body)) {
        errors.push({ message: 'unread arithmetic', pos: child.pos });
      }
    }

    forEachChild(child, visit);
  };

  visit(node);

  return errors;
}

const UNEXPECTED_TOKEN = /^unexpected token '(?<token>.+)'$/u;

// A stray operator, such as a doubled `&&`, makes unbash drop the rest of the
// line, so the segments come from the line with each one blanked out.
function blankUnexpectedTokens(command: string, errors: readonly ParseError[]): string {
  let text = command;

  for (const error of errors) {
    const token = UNEXPECTED_TOKEN.exec(error.message)?.groups?.['token'];

    if (token !== undefined && text.startsWith(token, error.pos)) {
      const blank = ' '.repeat(token.length);

      text = `${text.slice(0, error.pos)}${blank}${text.slice(error.pos + token.length)}`;
    }
  }

  return text;
}

function isQuoteError(error: ParseError): boolean {
  return /^unterminated (?:single quote|double quote|ANSI-C quote)$/u.test(error.message);
}

interface Walk {
  readonly segments: ShellSegment[];
  readonly hasCompound: boolean;
  readonly hasPipe: boolean;
  readonly readStatement: (statement: Statement) => void;
}

interface SourceRange {
  readonly pos: number;
  readonly end: number;
}

function buildWalk(
  command: string,
  errors: readonly ParseError[],
  quoteErrors: readonly ParseError[],
): Walk {
  const segments: ShellSegment[] = [];
  const scopes: ShellScope[] = [];
  let nextScope = 0;
  let isPipePending = false;
  let hasCompound = false;
  let hasPipe = false;

  const pushSegment = (
    range: SourceRange,
    words: readonly ShellWord[],
    redirects: readonly Redirection[],
    sources: readonly SyntaxNode[],
  ): void => {
    const text = command.slice(range.pos, range.end);
    const hasQuoteError = quoteErrors.some((error) => isWithin(error.pos, range));

    segments.push({
      text,
      start: range.pos,
      end: range.end,
      words,
      redirects: redirects.map((redirect) => buildRedirect(redirect)),
      substitutions: hasQuoteError
        ? collectRecoveredSubstitutions(text)
        : sources.flatMap((source) => collectSubstitutions(source)),
      isPiped: isPipePending,
      scopes: [...scopes],
    });

    isPipePending = false;
  };

  const withScope = (kind: ShellScope['kind'], run: () => void): void => {
    scopes.push({ id: nextScope, kind });

    nextScope += 1;

    run();

    scopes.pop();
  };

  const readList = (list: CompoundList): void => {
    for (const statement of list.commands) {
      readStatement(statement);
    }
  };

  const readStatement = (statement: Statement): void => {
    readPipelineNode(statement.command);
  };

  const readPipelineNode = (node: PipelineNode | Statement['command']): void => {
    if (node.type === 'AndOr') {
      for (const item of node.commands) {
        readPipelineNode(item);
      }
    } else if (node.type === 'Pipeline') {
      hasCompound ||= node.prefixes.length > 0;
      hasPipe ||= node.commands.length > 1;

      for (const [index, item] of node.commands.entries()) {
        isPipePending = index > 0;

        readCommandNode(item);
      }
    } else {
      readCommandNode(node);
    }
  };

  const readCommandNode = (node: CommandNode | CompoundList): void => {
    if (node.type === 'Command') {
      pushSegment(node, collectCommandWords(node, errors), node.redirects, [
        ...node.prefix,
        ...(node.name === undefined ? [] : [node.name]),
        ...node.suffix,
      ]);

      return;
    }

    hasCompound = true;

    match(node)
      .with({ type: 'CompoundList' }, (list) => readList(list))
      .with({ type: 'BraceGroup' }, (group) => readList(group.body))
      .with({ type: 'Subshell' }, (subshell) =>
        withScope('subshell', () => readList(subshell.body)),
      )
      .with({ type: 'Coproc' }, (coproc) =>
        withScope('subshell', () => readCommandNode(coproc.body)),
      )
      .with({ type: 'Redirected' }, (redirected) => {
        readCommandNode(redirected.command);
        pushSegment(redirected, [], redirected.redirects, redirected.redirects);
      })
      .with({ type: 'Function' }, (definition) =>
        withScope('conditional', () => readCommandNode(definition.body)),
      )
      .with({ type: 'If' }, (branch) =>
        withScope('conditional', () => {
          readList(branch.clause);
          readList(branch.then);

          for (const elif of branch.elif) {
            readList(elif.clause);
            readList(elif.then);
          }

          if (branch.else !== undefined) {
            readList(branch.else);
          }
        }),
      )
      .with({ type: 'While' }, (loop) =>
        withScope('conditional', () => {
          readList(loop.clause);
          readList(loop.body);
        }),
      )
      .with({ type: 'For' }, { type: 'Select' }, (loop) => {
        pushSegment(loop, [], [], loop.wordlist ?? []);
        withScope('conditional', () => readList(loop.body));
      })
      .with({ type: 'ArithmeticFor' }, (loop) => {
        const expressions = [loop.initialize, loop.test, loop.update].flatMap((expression) =>
          expression === undefined ? [] : [expression],
        );

        pushSegment(loop, [], [], expressions);
        withScope('conditional', () => readList(loop.body));
      })
      .with({ type: 'Case' }, (branch) => {
        pushSegment(branch, [], [], [branch.word, ...branch.items.flatMap((item) => item.pattern)]);

        withScope('conditional', () => {
          for (const item of branch.items) {
            readList(item.body);
          }
        });
      })
      .with({ type: 'TestCommand' }, { type: 'ArithmeticCommand' }, (test) =>
        pushSegment(test, [], [], [test]),
      )
      .exhaustive();
  };

  return {
    segments,
    get hasCompound() {
      return hasCompound;
    },
    get hasPipe() {
      return hasPipe;
    },
    readStatement,
  };
}

function isWithin(position: number, range: SourceRange): boolean {
  return position >= range.pos && position <= range.end;
}

function buildRedirect(redirect: Redirection): ShellRedirect {
  const descriptor =
    redirect.descriptor?.type === 'FileDescriptor' ? redirect.descriptor.value : null;

  return match(redirect)
    .with({ type: 'HereDoc' }, (heredoc) => ({
      operator: heredoc.operator,
      descriptor,
      target: heredoc.delimiter?.value ?? null,
      heredoc: {
        body: heredoc.body.text,
        isQuoted: heredoc.delimiter?.quoted ?? false,
        substitutions: collectSubstitutions(heredoc.body),
      },
      start: heredoc.pos,
    }))
    .with({ type: 'Redirect' }, { type: 'HereString' }, (file) => ({
      operator: file.operator,
      descriptor,
      target: file.target?.value ?? null,
      heredoc: null,
      start: file.pos,
    }))
    .exhaustive();
}

// The bodies of the outermost substitutions, in the order they appear. A
// heredoc body is read on its own.
function collectSubstitutions(node: SyntaxNode): string[] {
  if (node.type === 'HereDoc') {
    return [];
  }

  if (
    node.type === 'CommandExpansion' ||
    node.type === 'ProcessSubstitution' ||
    node.type === 'ArithmeticCommandExpansion'
  ) {
    return [toSubstitutionBody(node.text)];
  }

  const bodies: string[] = [];

  forEachChild(node, (child) => {
    bodies.push(...collectSubstitutions(child));
  });

  return bodies;
}

const CLOSERS: ReadonlyMap<string, string> = new Map([
  ['`', '`'],
  ['$(', ')'],
  ['<(', ')'],
  ['>(', ')'],
  ['${', '}'],
]);

function toSubstitutionBody(text: string): string {
  const opener = text.startsWith('`') ? '`' : text.slice(0, 2);
  const closer = CLOSERS.get(opener) ?? '';
  const isClosed = text.length > opener.length && text.endsWith(closer);
  const end = isClosed ? text.length - closer.length : text.length;

  return text.slice(opener.length, end);
}

// Bash refuses a line with an unclosed quote, but the agent's next line can
// close it, so its substitutions are read as if that quote were plain text.
const RECOVERY_LIMIT = 16;

function collectRecoveredSubstitutions(text: string): string[] {
  let recovered = text;
  let script = parse(recovered);

  for (let round = 0; round < RECOVERY_LIMIT; round += 1) {
    const error = script.errors?.find((candidate) => isQuoteError(candidate));

    if (error === undefined) {
      break;
    }

    recovered = `${recovered.slice(0, error.pos)}\\${recovered.slice(error.pos)}`;
    script = parse(recovered);
  }

  const walk = buildWalk(recovered, [], []);

  for (const statement of script.commands) {
    walk.readStatement(statement);
  }

  return walk.segments.flatMap((segment) => segment.substitutions);
}

// The assignments and the words keep their order in the command.
function collectCommandWords(node: Command, errors: readonly ParseError[]): ShellWord[] {
  const items = [
    ...node.prefix,
    ...(node.name === undefined ? [] : [node.name]),
    ...node.suffix,
  ].toSorted((left, right) => left.pos - right.pos);

  return items.flatMap((item) =>
    match(item)
      .with({ type: 'Word' }, (word) => [buildWord(word, errors)])
      .with({ type: 'Assignment' }, (assignment) => [buildAssignmentWord(assignment, errors)])
      .otherwise(() => []),
  );
}

function buildWord(word: Word, errors: readonly ParseError[]): ShellWord {
  return {
    raw: word.text,
    value: word.value,
    parts: word.parts ?? [],
    hasError: errors.some((error) => isWithin(error.pos, word)),
  };
}

function buildAssignmentWord(assignment: Assignment, errors: readonly ParseError[]): ShellWord {
  const head = assignment.text.slice(0, assignment.value.pos - assignment.pos);
  const hasError = errors.some((error) => isWithin(error.pos, assignment));

  return match(assignment.value)
    .with({ type: 'Word' }, (word) => ({
      raw: assignment.text,
      value: `${head}${word.value}`,
      parts: word.parts ?? [],
      hasError,
    }))
    .with({ type: 'ArrayValue' }, (array) => ({
      raw: assignment.text,
      value: assignment.text,
      parts: array.elements.flatMap((element) => element.parts ?? []),
      hasError,
    }))
    .exhaustive();
}

const SUBSTITUTIONS: ReadonlySet<string> = new Set([
  'CommandExpansion',
  'ProcessSubstitution',
  'ArithmeticCommandExpansion',
]);

function hasSubstitutionNode(node: SyntaxNode): boolean {
  let isFound = false;

  const visit = (child: SyntaxNode): void => {
    if (SUBSTITUTIONS.has(child.type)) {
      isFound = true;
    } else if (!isFound) {
      forEachChild(child, visit);
    }
  };

  forEachChild(node, visit);

  return isFound;
}
