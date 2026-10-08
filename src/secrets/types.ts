import type * as z from 'zod';
import type { secretRuleSetSchema } from './secret-rule-set-schema.ts';

export type SecretRuleSet = z.infer<typeof secretRuleSetSchema>;

export type SecretRule = SecretRuleSet['rules'][number];

export type SecretPattern = SecretRuleSet['prefilter'][number];

export type FilterTerm = SecretRuleSet['filter'][number];

export type FilterField = Extract<FilterTerm, { readonly kind: 'matches' }>['field'];
