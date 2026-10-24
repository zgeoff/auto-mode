import type * as z from 'zod';
import type { ModContext, ModRequest } from '../../mods/auto-mode/contract/types.ts';
import type { scopeRecordRequestSchema } from './scope-record-request-schema.ts';

type DeepReadonly<T> = T extends readonly (infer Item)[]
  ? readonly DeepReadonly<Item>[]
  : T extends object
    ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
    : T;

// A type read from the schema itself would inline zod's declarations into
// dist/index.d.ts.
export type DecisionContext = DeepReadonly<ModContext>;

export type ActionRequest = DeepReadonly<Omit<ModRequest, 'context'>> & {
  readonly decisionContext?: DecisionContext | undefined;
};

export type ParsedActionRequest = ActionRequest & { readonly decisionContext: DecisionContext };

export type ScopeRecordRequest = Readonly<z.infer<typeof scopeRecordRequestSchema>>;

export type Verdict =
  | { readonly kind: 'allow' }
  | { readonly kind: 'deny'; readonly rule: string; readonly reason: string };
