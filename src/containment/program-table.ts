import type { ScopeFinding } from './types.ts';

// The containment doc's program table section defines every field below and
// how the reader interprets it.
export type OptionPattern = string | RegExp;

export type OperandSelector =
  | 'all'
  | 'first'
  | 'after-first'
  | 'after-script'
  | 'destination'
  | 'sources';

type TargetRole =
  | 'path'
  | 'remote-path'
  | 'url'
  | 'remote-command'
  | 'branch'
  | 'remote'
  | 'refspec'
  | 'commit'
  | 'pull-request'
  | 'pull-request-merge'
  | 'forge-path';

export interface RuleFinding {
  readonly kind: ScopeFinding['kind'];
  readonly target?: string;
  readonly quote?: 'call' | 'operand';
}

export interface WriteRule {
  readonly flags?: readonly OptionPattern[];
  readonly readFlags?: readonly OptionPattern[];
  readonly words?: readonly RegExp[];
  readonly optionValue?: { readonly options: readonly string[]; readonly value: RegExp };
  readonly directory?: boolean;
  readonly options?: readonly string[];
  readonly operands?: readonly OperandSelector[];
  readonly scriptOptions?: readonly OptionPattern[];
  readonly role?: TargetRole;
  readonly whenNone?: string;
  readonly reads?: readonly string[];
  readonly repoOptions?: readonly string[];
  readonly ungrantFlags?: readonly OptionPattern[];
  readonly credentialPattern?: RegExp;
  readonly finding?: RuleFinding;
}

export interface ProgramEntry {
  readonly directoryOptions?: readonly string[];
  readonly valueOptions?: readonly OptionPattern[];
  readonly optionsEndAtOperand?: boolean;
  readonly subcommands?: Readonly<Record<string, ProgramEntry>>;
  readonly otherSubcommand?: { readonly pattern?: RegExp; readonly entry: ProgramEntry };
  readonly writes?: readonly WriteRule[];
}

const PATH_OPERANDS: ProgramEntry = { writes: [{ operands: ['all'] }] };
const TARGET_DIRECTORY = ['-t', '--target-directory'];

const COPY: ProgramEntry = {
  valueOptions: TARGET_DIRECTORY,
  writes: [{ options: TARGET_DIRECTORY, operands: ['destination'] }],
};

const IN_PLACE_SCRIPT = /^-\w*e$/u;

const IN_PLACE_EDIT: ProgramEntry = {
  valueOptions: [IN_PLACE_SCRIPT],
  writes: [{ flags: [/^-\w*i/u], operands: ['after-script'], scriptOptions: [IN_PLACE_SCRIPT] }],
};

const SSH_VALUE_OPTIONS = [
  '-b',
  '-c',
  '-D',
  '-E',
  '-F',
  '-i',
  '-J',
  '-l',
  '-L',
  '-m',
  '-o',
  '-p',
  '-P',
  '-Q',
  '-R',
  '-S',
  '-W',
  '-w',
];

const SCP_VALUE_OPTIONS = ['-c', '-D', '-F', '-i', '-J', '-l', '-o', '-P', '-S', '-X'];

const SSH_READS = [
  'cat',
  'df',
  'du',
  'free',
  'head',
  'id',
  'ls',
  'ps',
  'pwd',
  'stat',
  'tail',
  'uname',
  'uptime',
  'whoami',
];

const CURL_UPLOAD: RuleFinding = { kind: 'remote-write', target: 'curl upload' };
const CREDENTIAL_WRITE: ProgramEntry = { writes: [{ finding: { kind: 'credential' } }] };
const DOCKER_PRUNE: ProgramEntry = { writes: [{ finding: { kind: 'prune', quote: 'call' } }] };

const IAM_WRITE =
  /^(?:add|attach|change|create|deactivate|delete|detach|enable|put|remove|reset|set|tag|untag|update|upload)-/u;

const KUBECTL_WRITE: ProgramEntry = {
  writes: [{ finding: { kind: 'remote-write', target: 'kubectl write' } }],
};

const TERRAFORM_WRITE: ProgramEntry = {
  writes: [{ finding: { kind: 'remote-write', target: 'terraform write' } }],
};

const PRODUCTION_DEPLOY: WriteRule = {
  words: [/\bdeploy\b/u, /prod/u],
  finding: { kind: 'remote-write', target: 'production deploy' },
};

const CHECKOUT_WRITE: ProgramEntry = { writes: [{ directory: true }] };
const REFSPEC_WRITE: WriteRule = { operands: ['after-first'], role: 'refspec' };

const GIT: ProgramEntry = {
  directoryOptions: ['-C'],
  valueOptions: ['-c'],
  subcommands: {
    clean: CHECKOUT_WRITE,
    checkout: CHECKOUT_WRITE,
    switch: CHECKOUT_WRITE,
    merge: CHECKOUT_WRITE,
    commit: CHECKOUT_WRITE,
    rm: CHECKOUT_WRITE,
    stash: CHECKOUT_WRITE,
    reset: {
      writes: [
        { directory: true },
        {
          flags: ['--hard'],
          operands: ['first'],
          role: 'commit',
          finding: { kind: 'discard', target: 'git reset --hard' },
        },
      ],
    },
    push: {
      writes: [
        { directory: true },
        { flags: ['--all', '--mirror'], finding: { kind: 'branch', target: '--all' } },
        { operands: ['first'], role: 'remote' },
        { ...REFSPEC_WRITE, readFlags: ['--tags'], whenNone: 'HEAD' },
        { ...REFSPEC_WRITE, flags: ['--tags'] },
      ],
    },
    worktree: { subcommands: { remove: { writes: [{ operands: ['first'] }] } } },
    branch: { writes: [{ flags: ['-d', '-D', '--delete'], operands: ['all'], role: 'branch' }] },
    config: {
      writes: [
        {
          flags: ['--global'],
          readFlags: ['--get', '--get-all', '--get-regexp', '--list', '-l'],
          finding: { kind: 'credential', quote: 'operand' },
        },
      ],
    },
  },
};

const GH_REPO_OPTIONS = ['-R', '--repo'];

const PULL_REQUEST_WRITE: WriteRule = {
  operands: ['first'],
  role: 'pull-request',
  repoOptions: GH_REPO_OPTIONS,
  finding: { kind: 'remote-write' },
};

// The value options of each gh pr write command, from gh 2.102. A short flag can
// take a value under one command and none under another: `-m` names a milestone
// for `edit` and picks the merge method for `merge`.
const GH_PULL_REQUEST: ProgramEntry = {
  subcommands: {
    comment: {
      valueOptions: [...GH_REPO_OPTIONS, '-b', '--body', '-F', '--body-file', '--attach'],
      writes: [PULL_REQUEST_WRITE],
    },
    merge: {
      valueOptions: [
        ...GH_REPO_OPTIONS,
        '-A',
        '--author-email',
        '-b',
        '--body',
        '-F',
        '--body-file',
        '--match-head-commit',
        '-t',
        '--subject',
      ],
      writes: [
        {
          ...PULL_REQUEST_WRITE,
          role: 'pull-request-merge',
          ungrantFlags: [/^--admin(?:=|$)/u],
        },
      ],
    },
    edit: {
      valueOptions: [
        ...GH_REPO_OPTIONS,
        '--add-assignee',
        '--add-label',
        '--add-project',
        '--add-reviewer',
        '--attach',
        '-B',
        '--base',
        '-b',
        '--body',
        '-F',
        '--body-file',
        '-m',
        '--milestone',
        '--remove-assignee',
        '--remove-label',
        '--remove-project',
        '--remove-reviewer',
        '-t',
        '--title',
      ],
      writes: [PULL_REQUEST_WRITE],
    },
    close: { valueOptions: [...GH_REPO_OPTIONS, '-c', '--comment'], writes: [PULL_REQUEST_WRITE] },
    review: {
      valueOptions: [...GH_REPO_OPTIONS, '-b', '--body', '-F', '--body-file'],
      writes: [PULL_REQUEST_WRITE],
    },
    ready: { valueOptions: GH_REPO_OPTIONS, writes: [PULL_REQUEST_WRITE] },
    reopen: { valueOptions: [...GH_REPO_OPTIONS, '-c', '--comment'], writes: [PULL_REQUEST_WRITE] },
  },
};

const GH_API_FIELDS = ['-f', '-F', '--field', '--raw-field', '--input'];

const FORGE_WRITE: WriteRule = {
  operands: ['first'],
  role: 'forge-path',
  credentialPattern: /secret|collaborator|protection|key|permission/u,
  finding: { kind: 'remote-write' },
};

// gh api sends fields as a POST body unless the method is GET, which turns them
// into query parameters.
const GH_API: ProgramEntry = {
  valueOptions: [
    ...GH_API_FIELDS,
    '-X',
    '--method',
    '-H',
    '--header',
    '-q',
    '--jq',
    '-t',
    '--template',
    '--hostname',
    '-p',
    '--preview',
    '--cache',
  ],
  subcommands: {
    graphql: {
      writes: [
        {
          words: [/\bmutation\b/u],
          finding: { kind: 'remote-write', target: 'gh api graphql mutation' },
        },
      ],
    },
  },
  writes: [
    {
      ...FORGE_WRITE,
      optionValue: { options: ['-X', '--method'], value: /^(?:POST|PUT|PATCH|DELETE)$/iu },
    },
    { ...FORGE_WRITE, flags: GH_API_FIELDS, readFlags: ['-X', '--method'] },
  ],
};

const GH_READS: Readonly<Record<string, ProgramEntry>> = {
  list: {},
  view: {},
  clone: {},
  status: {},
  checks: {},
  diff: {},
};

const REMOTE_WRITE: ProgramEntry = { writes: [{ finding: { kind: 'remote-write' } }] };

const GH_REMOTE_GROUP: ProgramEntry = {
  subcommands: GH_READS,
  otherSubcommand: { entry: REMOTE_WRITE },
};

const GH_CREDENTIAL_GROUP: ProgramEntry = {
  subcommands: GH_READS,
  otherSubcommand: { entry: CREDENTIAL_WRITE },
};

const GH: ProgramEntry = {
  subcommands: {
    pr: GH_PULL_REQUEST,
    issue: GH_REMOTE_GROUP,
    api: GH_API,
    auth: {
      subcommands: { refresh: CREDENTIAL_WRITE, login: CREDENTIAL_WRITE, logout: CREDENTIAL_WRITE },
    },
    secret: GH_CREDENTIAL_GROUP,
    variable: GH_CREDENTIAL_GROUP,
    'ssh-key': GH_CREDENTIAL_GROUP,
    'gpg-key': GH_CREDENTIAL_GROUP,
    gist: GH_REMOTE_GROUP,
    release: GH_REMOTE_GROUP,
    repo: GH_REMOTE_GROUP,
    ruleset: GH_REMOTE_GROUP,
    label: GH_REMOTE_GROUP,
    workflow: GH_REMOTE_GROUP,
  },
};

export const PROGRAM_TABLE: Readonly<Record<string, ProgramEntry>> = {
  git: GIT,
  gh: GH,
  rm: PATH_OPERANDS,
  rmdir: PATH_OPERANDS,
  shred: PATH_OPERANDS,
  truncate: PATH_OPERANDS,
  chmod: PATH_OPERANDS,
  chown: PATH_OPERANDS,
  cp: COPY,
  ln: COPY,
  mv: {
    valueOptions: TARGET_DIRECTORY,
    writes: [{ options: TARGET_DIRECTORY, operands: ['destination', 'sources'] }],
  },
  rsync: { writes: [{ operands: ['destination'] }] },
  find: { writes: [{ flags: ['-delete', '-exec'], operands: ['first'] }] },
  sed: IN_PLACE_EDIT,
  perl: IN_PLACE_EDIT,
  'ssh-keygen': {
    valueOptions: ['-f'],
    writes: [{ readFlags: ['-l', '-y', '-F', '-B', '-R'], options: ['-f'] }],
  },
  ssh: {
    valueOptions: SSH_VALUE_OPTIONS,
    optionsEndAtOperand: true,
    writes: [
      { options: ['-E'] },
      {
        operands: ['all'],
        role: 'remote-command',
        reads: SSH_READS,
        finding: { kind: 'remote-write' },
      },
    ],
  },
  scp: {
    valueOptions: SCP_VALUE_OPTIONS,
    optionsEndAtOperand: true,
    writes: [{ operands: ['destination'], role: 'remote-path', finding: { kind: 'remote-write' } }],
  },
  curl: {
    valueOptions: ['-X', '--request'],
    writes: [
      {
        flags: [/^-[a-zA-Z]*[dFT]$/u, /^--(?:data\S*|form|upload-file|json)$/u],
        operands: ['all'],
        role: 'url',
        finding: CURL_UPLOAD,
      },
      {
        optionValue: { options: ['-X', '--request'], value: /^(?:POST|PUT|PATCH|DELETE)$/u },
        operands: ['all'],
        role: 'url',
        finding: CURL_UPLOAD,
      },
    ],
  },
  op: {
    subcommands: {
      item: {
        subcommands: { edit: CREDENTIAL_WRITE, create: CREDENTIAL_WRITE, delete: CREDENTIAL_WRITE },
      },
      vault: {
        subcommands: { edit: CREDENTIAL_WRITE, create: CREDENTIAL_WRITE, delete: CREDENTIAL_WRITE },
      },
      document: {
        subcommands: { edit: CREDENTIAL_WRITE, create: CREDENTIAL_WRITE, delete: CREDENTIAL_WRITE },
      },
    },
  },
  aws: {
    subcommands: { iam: { otherSubcommand: { pattern: IAM_WRITE, entry: CREDENTIAL_WRITE } } },
  },
  docker: {
    valueOptions: [
      '--config',
      '-c',
      '--context',
      '-H',
      '--host',
      '-l',
      '--log-level',
      '--tlscacert',
      '--tlscert',
      '--tlskey',
    ],
    subcommands: {
      volume: { subcommands: { prune: DOCKER_PRUNE, rm: DOCKER_PRUNE } },
      system: { subcommands: { prune: DOCKER_PRUNE } },
      image: { subcommands: { prune: DOCKER_PRUNE } },
      container: { subcommands: { prune: DOCKER_PRUNE } },
      compose: {
        valueOptions: [
          '--ansi',
          '--env-file',
          '-f',
          '--file',
          '--parallel',
          '--profile',
          '--progress',
          '--project-directory',
          '-p',
          '--project-name',
        ],
        subcommands: {
          down: {
            writes: [{ flags: ['-v', '--volumes'], finding: { kind: 'prune', quote: 'call' } }],
          },
        },
      },
    },
  },
  kubectl: {
    valueOptions: [
      '--as',
      '--as-group',
      '--cache-dir',
      '--certificate-authority',
      '--client-certificate',
      '--client-key',
      '--cluster',
      '--context',
      '--kubeconfig',
      '-n',
      '--namespace',
      '--request-timeout',
      '-s',
      '--server',
      '--tls-server-name',
      '--token',
      '--user',
    ],
    subcommands: {
      apply: KUBECTL_WRITE,
      delete: KUBECTL_WRITE,
      replace: KUBECTL_WRITE,
      patch: KUBECTL_WRITE,
      scale: KUBECTL_WRITE,
    },
  },
  terraform: {
    subcommands: { apply: TERRAFORM_WRITE, destroy: TERRAFORM_WRITE, import: TERRAFORM_WRITE },
  },
  codex: {
    subcommands: {
      exec: {
        valueOptions: ['-o', '--output-last-message'],
        writes: [{ options: ['-o', '--output-last-message'] }],
      },
    },
  },
  psql: {
    writes: [
      {
        words: [/\b(?:UPDATE|DELETE|DROP|INSERT|TRUNCATE|ALTER)\b/iu],
        finding: { kind: 'remote-write', target: 'database write' },
      },
    ],
  },
  npm: {
    subcommands: { publish: { writes: [{ finding: { kind: 'remote-write' } }] } },
    writes: [PRODUCTION_DEPLOY],
  },
  bun: { writes: [PRODUCTION_DEPLOY] },
  pnpm: { writes: [PRODUCTION_DEPLOY] },
  yarn: { writes: [PRODUCTION_DEPLOY] },
};
