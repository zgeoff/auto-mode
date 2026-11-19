import { parseDecision } from '../../mods/auto-mode/hooks/parse-decision.ts';
import { renderVerdict } from '../request/render-verdict.ts';
import type { Verdict } from '../request/types.ts';

// Reads a verdict the way the mod does: the CLI's rendered stdout, through the mod's own parser.
export function parseRenderedVerdict(verdict: Verdict): ReturnType<typeof parseDecision> {
  return parseDecision(renderVerdict(verdict));
}
