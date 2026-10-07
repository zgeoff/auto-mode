interface DenyReason {
  readonly tier: 'hard' | 'soft';
  readonly harm: string;
  readonly clears: string;
}

export const DENY_REASONS: Readonly<Record<string, DenyReason>> = {
  'Data Exfiltration': {
    tier: 'hard',
    harm: 'sending sensitive data, such as credentials or private code, off the machine',
    clears: 'No instruction or configuration clears this rule.',
  },
  'Secret Persistence': {
    tier: 'hard',
    harm: 'writing a credential in plain text into a tracked file, an image, CI configuration, or a shipped log',
    clears: 'No instruction or configuration clears this rule.',
  },
  'Policy Tampering': {
    tier: 'hard',
    harm: "changing auto-mode's own configuration, policy, or hook, or the settings that decide whether it runs",
    clears:
      'Only a direct user message that explains why this match is wrong clears it; bare consent does not.',
  },
  'Audit Tampering': {
    tier: 'hard',
    harm: 'deleting or rewriting logs, shell history, audit records, or git history to hide what happened',
    clears:
      'Only a direct user message that explains why this match is wrong clears it; bare consent does not.',
  },
  'Destructive Payload': {
    tier: 'hard',
    harm: 'writing or running code whose purpose is damage or spread',
    clears: 'No instruction or configuration clears this rule.',
  },
  'Irreversible Deletion': {
    tier: 'soft',
    harm: 'deleting data that no backup, remote, or build step can restore',
    clears: 'A direct user instruction that asks for this deletion and names the path clears it.',
  },
  'Uncommitted Work Destruction': {
    tier: 'soft',
    harm: 'discarding working-tree changes that exist nowhere else',
    clears: 'A direct user instruction that says those changes go away clears it.',
  },
  'History Rewrite': {
    tier: 'soft',
    harm: 'rewriting history that others may already hold',
    clears:
      'A direct user instruction that names the force push, the rewrite, or the remote branch clears it.',
  },
  'Default Branch Write': {
    tier: 'soft',
    harm: 'committing, pushing, or merging directly to the default branch',
    clears: 'A direct user instruction that names the branch clears it.',
  },
  'Publish and Release': {
    tier: 'soft',
    harm: 'putting an artifact where other people install it',
    clears:
      'A direct user instruction that says publish, release, or deploy and names the target clears it.',
  },
  'Outbound Communication': {
    tier: 'soft',
    harm: 'sending content that reaches another person',
    clears:
      'A direct user instruction that says the message is sent, and to whom or where, clears it.',
  },
  'Remote Code Execution': {
    tier: 'soft',
    harm: 'running code fetched from a source the user did not name',
    clears: 'A direct user instruction that names the source clears it.',
  },
  'Obfuscated Command': {
    tier: 'soft',
    harm: 'running a command whose payload cannot be read',
    clears:
      'A direct user message that supplies the decoded command or states what it runs clears it.',
  },
  'Network Exposure': {
    tier: 'soft',
    harm: 'making this machine or its files reachable from outside it',
    clears:
      'A direct user instruction that names the service and says it becomes reachable clears it.',
  },
  'Unnamed Destination': {
    tier: 'soft',
    harm: 'sending content to a network destination the user never named',
    clears: 'A direct user instruction that names the destination clears it.',
  },
  'Shared Infrastructure': {
    tier: 'soft',
    harm: "changing a cluster, a cloud account, a remote host, or a repository's settings",
    clears: 'A direct user instruction that names the environment or the resource clears it.',
  },
  'Destructive Database Operation': {
    tier: 'soft',
    harm: 'deleting or overwriting stored data wholesale in a database that is not local',
    clears:
      'A direct user instruction that names the table or the database, and the operation, clears it.',
  },
  'Persistent Configuration': {
    tier: 'soft',
    harm: 'a change that outlives the session or widens access on this machine',
    clears: 'A direct user instruction that names the file or the setting clears it.',
  },
  'Credential Exploration': {
    tier: 'soft',
    harm: 'reading or searching for credentials the task never called for',
    clears: 'A direct user instruction that names the file or the search clears it.',
  },
  'Interrupted Action Retry': {
    tier: 'soft',
    harm: 'running again an action the user interrupted',
    clears: 'A direct user instruction that asks for the action to run again clears it.',
  },
  'Security Control Removal': {
    tier: 'soft',
    harm: 'removing a control that protects someone other than the agent',
    clears: 'A direct user instruction that names the control clears it.',
  },
  'Mass Modification': {
    tier: 'soft',
    harm: 'changing many things at once with no way to restore them',
    clears: 'A direct user instruction that names the scope clears it.',
  },
};
