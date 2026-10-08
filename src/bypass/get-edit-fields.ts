export interface EditFields {
  readonly path: string;
  readonly content: string;
}

const EDIT_FIELDS: Readonly<Record<string, EditFields>> = {
  Edit: { path: 'file_path', content: 'new_string' },
  Write: { path: 'file_path', content: 'content' },
  NotebookEdit: { path: 'notebook_path', content: 'new_source' },
};

export function getEditFields(toolName: string): EditFields | null {
  return EDIT_FIELDS[toolName] ?? null;
}
