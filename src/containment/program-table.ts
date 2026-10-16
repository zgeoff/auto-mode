import type { ScopeFinding } from './types.ts';

// The containment doc's program table section defines every field below and
// how the reader interprets it.
export type OptionPattern = string | RegExp;

export type OperandSelector = 'all' | 'first' | 'after-script' | 'destination' | 'sources';

type TargetRole = 'path' | 'remote-path' | 'url' | 'remote-command';

export interface RuleFinding {
  readonly kind: ScopeFinding['kind'];
  readonly target?: string;
  readonly quote?: 'call';
}

export interface WriteRule {
  readonly flags?: readonly OptionPattern[];
  readonly readFlags?: readonly OptionPattern[];
  readonly words?: readonly RegExp[];
  readonly optionValue?: { readonly options: readonly string[]; readonly value: RegExp };
  readonly options?: readonly string[];
  readonly operands?: readonly OperandSelector[];
  readonly scriptOptions?: readonly OptionPattern[];
  readonly role?: TargetRole;
  readonly reads?: readonly string[];
  readonly finding?: RuleFinding;
}

export interface ProgramEntry {
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

export const PROGRAM_TABLE: Readonly<Record<string, ProgramEntry>> = {
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
