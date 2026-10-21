import { expect, test } from 'bun:test';
import { hasLocalHookSkip } from './has-local-hook-skip.ts';

test.each([
  ['Write', { file_path: '/repo/lefthook-local.yml', content: 'pre-push:\n  skip: true\n' }],
  [
    'Write',
    {
      file_path: '/repo/lefthook-local.yml',
      content: 'pre-push:\n  jobs:\n    - name: test\n      skip: true\n',
    },
  ],
  [
    'Write',
    { file_path: '/repo/.lefthook-local.yaml', content: 'pre-commit:\n  exclude_tags: [lint]\n' },
  ],
  [
    'Write',
    {
      file_path: '/repo/lefthook-local.json',
      content: '{"pre-push":{"commands":{"test":{"skip":true}}}}',
    },
  ],
  ['Write', { file_path: '/repo/lefthook-local.toml', content: '[pre-push]\nskip = true\n' }],
  [
    'Edit',
    {
      file_path: '/repo/lefthook-local.yml',
      old_string: '  skip: false\n',
      new_string: '  skip: true\n',
    },
  ],
  [
    'Edit',
    {
      file_path: '/repo/lefthook-local.yml',
      old_string: 'pre-push:\n',
      new_string: 'pre-push:\n  exclude:\n    - "src/**"\n',
    },
  ],
  [
    'Edit',
    {
      file_path: '/repo/lefthook-local.yml',
      old_string: '      skip: [merge]\n',
      new_string: '      skip: [merge]\n    - name: lint\n      skip: true\n',
    },
  ],
  [
    'Edit',
    {
      file_path: '/repo/lefthook-local.yml',
      old_string: '  exclude_tags: []\n',
      new_string: '  exclude_tags: [test]\n',
    },
  ],
  [
    'Edit',
    {
      file_path: '/repo/lefthook-local.yml',
      old_string: '  exclude_tags:\n    - lint\n',
      new_string: '  exclude_tags:\n    - lint\n    - test\n',
    },
  ],
  [
    'Edit',
    {
      file_path: '/repo/lefthook-local.yml',
      old_string: '  exclude_tags: [lint]\n',
      new_string: '  exclude_tags: [lint, test]\n',
    },
  ],
  [
    'Edit',
    {
      file_path: '/repo/lefthook-local.json',
      old_string: '"exclude_tags": ["lint"]',
      new_string: '"exclude_tags": ["lint", "test"]',
    },
  ],
  [
    'Edit',
    {
      file_path: '/repo/lefthook-local.yml',
      old_string: '  skip: [merge]\n',
      new_string: '  skip: true\n',
    },
  ],
  [
    'Edit',
    {
      file_path: '/repo/lefthook-local.yml',
      old_string: '  # skip: true\n',
      new_string: '  skip: true\n',
    },
  ],
])('it finds a skip setting written by %s into a local lefthook config', (toolName, toolInput) => {
  expect(hasLocalHookSkip({ toolName, toolInput }, null)).toBeTrue();
});

test.each([
  ['Write', { file_path: '/repo/lefthook.yml', content: 'pre-push:\n  skip: true\n' }],
  ['Write', { file_path: '/repo/lefthook-local.yml', content: 'pre-push:\n  parallel: false\n' }],
  ['Write', { file_path: '/repo/lefthook-local.yml', content: 'pre-push:\n  skip: false\n' }],
  ['Write', { file_path: '/repo/lefthook-local.json', content: '{"pre-push":{"skip": "false"}}' }],
  ['Write', { file_path: '/repo/lefthook-local.yml.bak', content: 'pre-push:\n  skip: true\n' }],
  [
    'Edit',
    {
      file_path: '/repo/lefthook-local.yml',
      old_string: '  skip: true\n',
      new_string: '  skip: false\n',
    },
  ],
  [
    'Edit',
    {
      file_path: '/repo/lefthook-local.yml',
      old_string: '  skip: true\n',
      new_string: '',
    },
  ],
  [
    'Write',
    { file_path: '/repo/lefthook-local.yml', content: '# skip: true\noutput: [summary]\n' },
  ],
  ['Write', { file_path: '/repo/lefthook-local.yml', content: 'pre-push:\n  exclude_tags: []\n' }],
  ['Write', { file_path: '/repo/lefthook-local.yml', content: 'pre-push:\n  exclude: ""\n' }],
  [
    'Write',
    {
      file_path: '/repo/lefthook-local.jsonc',
      content: '// "skip": true\n{"output": ["summary"]}',
    },
  ],
  [
    'Edit',
    {
      file_path: '/repo/lefthook-local.yml',
      old_string: 'pre-push:\n  skip: [merge]\n  parallel: false\n',
      new_string: 'pre-push:\n  skip: [merge]\n  parallel: true\n',
    },
  ],
  ['NotebookEdit', { notebook_path: '/repo/lefthook-local.yml', new_source: 'skip: true' }],
  ['Read', { file_path: '/repo/lefthook-local.yml' }],
])('it finds no skip setting written by %s in %o', (toolName, toolInput) => {
  expect(hasLocalHookSkip({ toolName, toolInput }, null)).toBeFalse();
});

test.each([
  String.raw`printf 'pre-push:\n  skip: true\n' > lefthook-local.yml`,
  String.raw`printf 'pre-push:\n  exclude_tags: [test]\n' >> /repo/.lefthook-local.yml`,
  "cat > lefthook-local.yml <<'EOF'\npre-push:\n  jobs:\n    - name: test\n      skip: true\nEOF",
  'echo \'{"pre-push":{"skip":true}}\' | tee lefthook-local.json',
])('it finds the shell write of a skip setting in %s', (command) => {
  expect(hasLocalHookSkip({ toolName: 'Bash', toolInput: { command } }, null)).toBeTrue();
});

test.each([
  'cat lefthook-local.yml',
  'grep -n "skip:" lefthook-local.yml',
  String.raw`printf 'pre-push:\n  skip: true\n' > lefthook.yml`,
  String.raw`printf 'pre-push:\n  parallel: true\n' > lefthook-local.yml`,
  String.raw`printf 'pre-push:\n  skip: false\n' > lefthook-local.yml`,
  String.raw`printf 'pre-commit:\n  exclude_tags: []\n' >> lefthook-local.yml`,
  "cat > lefthook-local.yml <<'EOF'\npre-push:\n  skip: false\nEOF",
  'grep -n "skip:" lefthook-local.yml 2>&1',
])('it finds no shell write of a skip setting in %s', (command) => {
  expect(hasLocalHookSkip({ toolName: 'Bash', toolInput: { command } }, null)).toBeFalse();
});

test.each([
  ['pre-push:\n  skip: false\n', 'false', 'true', true],
  ['pre-commit:\n  exclude_tags: [lint]\n', 'lint]', 'lint, test]', true],
  [
    'pre-push:\n  jobs:\n    - name: test\n',
    'name: test\n',
    'name: test\n      skip: true\n',
    true,
  ],
  ['pre-push:\n  skip: true\n', 'true', 'false', false],
  ['pre-push:\n  skip: true\n  parallel: false\n', 'parallel: false', 'parallel: true', false],
  ['pre-push:\n  skip: false\n', 'skip: false', 'skip: false\n  parallel: true', false],
])(
  'it reads the Edit of %o from %o to %o against the current config as adding a skip: %p',
  (current, oldString, newString, expected) => {
    expect(
      hasLocalHookSkip(
        {
          toolName: 'Edit',
          toolInput: {
            file_path: '/repo/lefthook-local.yml',
            old_string: oldString,
            new_string: newString,
          },
        },
        current,
      ),
    ).toBe(expected);
  },
);

test('it applies an Edit that replaces every match to each place in the current config', () => {
  expect(
    hasLocalHookSkip(
      {
        toolName: 'Edit',
        toolInput: {
          file_path: '/repo/lefthook-local.yml',
          old_string: 'skip: false',
          new_string: 'skip: true',
          replace_all: true,
        },
      },
      'pre-push:\n  skip: true\npre-commit:\n  skip: false\n',
    ),
  ).toBeTrue();
});
