import type { PrimarySourceCitation } from '@stock-vetter/schema';
import { matchTierMeta, type MatchTier } from '@/lib/checklist';

/**
 * One cited quote from a filing. The section label and the quote are always
 * visible (no navigating away — per the spec). Tap to expand "why it matters".
 * The match-tier badge shows whether the quote was found verbatim in the source
 * by the grep-verifier (the citation-fabrication safety net).
 */
export function CitationCard({
  citation,
  matchTier,
}: {
  citation: PrimarySourceCitation;
  matchTier?: MatchTier;
}) {
  const m = matchTierMeta(matchTier);
  return (
    <details className="group rounded-md border border-slate-200 bg-slate-50/60">
      <summary className="flex cursor-pointer list-none flex-col gap-1.5 px-3 py-2">
        <span className="flex items-center gap-1.5">
          <span className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
            {citation.section}
          </span>
          <span className={`rounded-full border px-1.5 py-0.5 text-[10px] ${m.pill}`}>
            {m.label}
          </span>
          <span className="ml-auto text-slate-300 transition-transform group-open:rotate-90">›</span>
        </span>
        <span className="text-[12px] italic leading-snug text-slate-700">
          &ldquo;{citation.quote}&rdquo;
        </span>
      </summary>
      <div className="border-t border-slate-200 px-3 py-2 text-[12px] leading-snug text-slate-600">
        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
          Why it matters
        </span>
        <br />
        {citation.whyItMatters}
      </div>
    </details>
  );
}
