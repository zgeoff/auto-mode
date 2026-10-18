import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseSync } from 'oxc-parser';
import invariant from 'tiny-invariant';

// A rename by identifier node leaves strings and comments alone, and renames a
// property with its readers. A file that already holds the new name is skipped
// and listed, because the rename could shadow it.

const ROOT = join(import.meta.dirname, '..');

interface AstNode {
  readonly type: string;
  readonly start: number;
  readonly end: number;
  readonly name?: string;
  readonly [key: string]: unknown;
}

async function main(): Promise<void> {
  const [from, to, ...skipped] = process.argv.slice(2);

  if (from === undefined || to === undefined) {
    console.error('usage: bun scripts/rename-identifier.ts <from> <to> [skipped file...]');
    process.exit(2);
  }

  const files = await collectTrackedFiles();

  let renamed = 0;

  for (const file of files) {
    if (skipped.includes(file)) {
      continue;
    }

    const path = join(ROOT, file);

    const source = await readFile(path, 'utf8');

    const program: unknown = parseSync(file, source).program;

    invariant(isAstNode(program), `${file} parses to a program node`);

    const starts = collectRenameStarts(program, from);

    if (starts.length === 0) {
      continue;
    }

    if (collectRenameStarts(program, to).length > 0) {
      console.log(`skipped ${file}: it already names \`${to}\``);
      continue;
    }

    const updated = starts
      .toSorted((left, right) => right - left)
      .reduce((text, start) => text.slice(0, start) + to + text.slice(start + from.length), source);

    await writeFile(path, updated);

    renamed += 1;
  }

  console.log(`renamed \`${from}\` to \`${to}\` in ${renamed} files`);
}

async function collectTrackedFiles(): Promise<string[]> {
  const child = Bun.spawn(['git', 'ls-files', '*.ts'], { cwd: ROOT, stdout: 'pipe' });

  const output = await new Response(child.stdout).text();

  // oxlint ignores .claude/, so its files keep their names.
  return output.split('\n').filter((file) => file !== '' && !file.startsWith('.claude/'));
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

await main();
