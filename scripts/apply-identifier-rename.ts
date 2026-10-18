import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cli, define } from 'gunshi';
import { parseSync } from 'oxc-parser';
import invariant from 'tiny-invariant';

// A rename by identifier node leaves strings and comments alone, and renames a
// property with its readers. A file that already holds the new name keeps its
// text, because the rename could shadow it.

export interface IdentifierRename {
  readonly root: string;
  readonly from: string;
  readonly to: string;
  readonly skipped: readonly string[];
}

export interface IdentifierRenameOutcome {
  readonly renamed: readonly string[];
  readonly collided: readonly string[];
}

export async function applyIdentifierRename(
  rename: Readonly<IdentifierRename>,
): Promise<IdentifierRenameOutcome> {
  const renamed: string[] = [];
  const collided: string[] = [];

  for (const file of readTrackedFiles(rename.root)) {
    if (rename.skipped.includes(file)) {
      continue;
    }

    const path = join(rename.root, file);

    const source = await readFile(path, 'utf8');

    const program: unknown = parseSync(file, source).program;

    invariant(isAstNode(program), `${file} parses to a program node`);

    const starts = collectRenameStarts(program, rename.from);

    if (starts.length === 0) {
      continue;
    }

    if (collectRenameStarts(program, rename.to).length > 0) {
      collided.push(file);
      continue;
    }

    const updated = starts
      .toSorted((left, right) => right - left)
      .reduce(
        (text, start) => text.slice(0, start) + rename.to + text.slice(start + rename.from.length),
        source,
      );

    await writeFile(path, updated);

    renamed.push(file);
  }

  return { renamed, collided };
}

function readTrackedFiles(root: string): string[] {
  const output = execFileSync('git', ['ls-files', '*.ts'], { cwd: root, encoding: 'utf8' });

  // oxlint ignores .claude/, so its files keep their names.
  return output.split('\n').filter((file) => file !== '' && !file.startsWith('.claude/'));
}

interface AstNode {
  readonly type: string;
  readonly start: number;
  readonly end: number;
  readonly name?: string;
  readonly [key: string]: unknown;
}

function collectRenameStarts(program: AstNode, name: string): number[] {
  const starts = new Set<number>();

  for (const visited of collectNodes(program, null)) {
    const node = visited.node;
    const parent = visited.parent;
    const object = parent?.['object'];

    // Bun's import.meta.dir belongs to the runtime.
    const isImportMetaProperty =
      parent?.type === 'MemberExpression' &&
      parent['property'] === node &&
      isAstNode(object) &&
      object.type === 'MetaProperty';

    if (node.type === 'Identifier' && node.name === name && !isImportMetaProperty) {
      starts.add(node.start);
    }
  }

  return [...starts];
}

interface VisitedNode {
  readonly node: AstNode;
  readonly parent: AstNode | null;
}

function collectNodes(node: AstNode, parent: AstNode | null): VisitedNode[] {
  const children = Object.values(node)
    .flatMap((value: unknown): unknown[] => (Array.isArray(value) ? (value as unknown[]) : [value]))
    .filter((value): value is AstNode => isAstNode(value));

  return [{ node, parent }, ...children.flatMap((child) => collectNodes(child, node))];
}

function isAstNode(value: unknown): value is AstNode {
  return (
    typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string'
  );
}

if (import.meta.main) {
  const command = define({
    name: 'apply-identifier-rename',
    args: {
      from: { type: 'positional', description: 'the name to replace' },
      to: { type: 'positional', description: 'the name that replaces it' },
      skip: { type: 'string', multiple: true, description: 'a tracked file to leave alone' },
    },
    run: async (ctx) => {
      const outcome = await applyIdentifierRename({
        root: join(import.meta.dirname, '..'),
        from: ctx.values.from,
        to: ctx.values.to,
        skipped: ctx.values.skip ?? [],
      });

      for (const file of outcome.collided) {
        console.log(`skipped ${file}: it already names \`${ctx.values.to}\``);
      }

      console.log(
        `renamed \`${ctx.values.from}\` to \`${ctx.values.to}\` in ${outcome.renamed.length} files`,
      );
    },
  });

  await cli(Bun.argv.slice(2), command);
}
