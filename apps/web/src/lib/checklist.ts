/**
 * Parse the full `primary-source-checklist.json` blob stored in
 * `primary_source_runs.checklist_json`. That file is `{ pass1, pass2, pass3,
 * pass1Verification, pass2Verification }`. pass1/2/3 have schemas in
 * @stock-vetter/schema; the verification reports come from the pipeline's
 * citation-verifier (not exported as a schema), so we define a light shape here
 * — only the fields the deep view needs (per-citation match tier).
 */
import { z } from 'zod';
import {
  PrimarySourceChecklist,
  PrimarySourceSkeptic,
  PrimarySourceJudgment,
} from '@stock-vetter/schema';

export type MatchTier =
  | 'exact'
  | 'whitespace-normalized'
  | 'case-insensitive'
  | 'punctuation-normalized'
  | 'no-match';

const VerificationDetail = z.object({
  dimension: z.string(),
  citationIndex: z.number().int(),
  section: z.string().optional(),
  quote: z.string().optional(),
  matchTier: z.string(),
  quotePreview: z.string().optional(),
});

const VerificationReport = z
  .object({
    total: z.number().int().optional(),
    exact: z.number().int().optional(),
    whitespaceNormalized: z.number().int().optional(),
    caseInsensitive: z.number().int().optional(),
    punctuationNormalized: z.number().int().optional(),
    noMatch: z.number().int().optional(),
    details: z.array(VerificationDetail).optional(),
  })
  .passthrough();

export const ChecklistBundle = z
  .object({
    pass1: PrimarySourceChecklist,
    pass2: PrimarySourceSkeptic.optional(),
    pass3: PrimarySourceJudgment.optional(),
    pass1Verification: VerificationReport.optional(),
    pass2Verification: VerificationReport.optional(),
  })
  .passthrough();
export type ChecklistBundle = z.infer<typeof ChecklistBundle>;

/**
 * Index a verification report so a component can look up the match tier for
 * (dimension, citationIndex) cheaply. Returns a Map keyed `"<dim>:<idx>"`.
 */
export function indexMatchTiers(
  report: z.infer<typeof VerificationReport> | undefined,
): Map<string, MatchTier> {
  const out = new Map<string, MatchTier>();
  for (const d of report?.details ?? []) {
    out.set(`${d.dimension}:${d.citationIndex}`, d.matchTier as MatchTier);
  }
  return out;
}

export function matchTierMeta(tier: MatchTier | undefined): {
  label: string;
  pill: string;
} {
  switch (tier) {
    case 'exact':
      return { label: 'verbatim', pill: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'whitespace-normalized':
      return { label: 'verbatim (spacing)', pill: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'case-insensitive':
      return { label: 'verbatim (case)', pill: 'bg-amber-50 text-amber-800 border-amber-200' };
    case 'punctuation-normalized':
      return { label: 'verbatim (punct.)', pill: 'bg-amber-50 text-amber-800 border-amber-200' };
    case 'no-match':
      return { label: 'not located', pill: 'bg-rose-50 text-rose-700 border-rose-200' };
    default:
      return { label: 'not checked', pill: 'bg-slate-50 text-slate-500 border-slate-200' };
  }
}
