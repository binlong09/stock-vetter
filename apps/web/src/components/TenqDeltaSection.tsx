import type { TenqDelta } from '@stock-vetter/schema';
import { DeepSection } from './DeepSection';
import { isoDate } from '@/lib/format';

// "Changes since annual baseline (10-Q)" — ADDITIVE change detection. This does
// NOT affect the verdict or any dimension score; it surfaces material qualitative
// change in the latest 10-Q against the 10-K baseline. Each change shows DUAL
// citations kept attributed to their own filing (10-Q passage + the 10-K passage
// it diverges from) — never merged. Provenance (which 10-Q vs which 10-K) is
// shown so the comparison's basis is visible.
const DIRECTION_META: Record<
  TenqDelta['changes'][number]['direction'],
  { label: string; cls: string }
> = {
  improving: { label: '▲ improving', cls: 'text-emerald-700 bg-emerald-50' },
  deteriorating: { label: '▼ deteriorating', cls: 'text-red-700 bg-red-50' },
  'neutral-but-notable': { label: '◆ notable', cls: 'text-slate-700 bg-slate-100' },
};

export function TenqDeltaSection({ delta }: { delta: TenqDelta }) {
  // The collapsed header must state honest scope. When coverage is limited we
  // fold the scoped headline into the title (e.g. "… — 10 risk-factor changes;
  // MD&A not assessed") and drop the bare numeric count so the header never
  // shows a misleading "10". With full coverage, keep the clean numeric count.
  const limited = delta.coverageWarnings.length > 0;
  const title = limited
    ? `Changes since annual baseline (10-Q) — ${delta.headline}`
    : 'Changes since annual baseline (10-Q)';

  return (
    <DeepSection title={title} count={limited ? undefined : delta.changes.length}>
      <p className="mb-2 text-[11px] text-slate-400">
        Comparing 10-Q <span className="font-mono">{delta.tenqAccession}</span> (filed{' '}
        {isoDate(delta.tenqFilingDate)}) against 10-K{' '}
        <span className="font-mono">{delta.tenkAccession}</span> (filed{' '}
        {isoDate(delta.tenkFilingDate)}). Change detection only — does not affect the verdict or
        dimension scores.
      </p>

      {limited && (
        <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-[12px] text-amber-800">
          {delta.coverageWarnings.map((w, i) => (
            <p key={i} className={i > 0 ? 'mt-1' : ''}>
              ⚠️ <span className="font-semibold">Coverage limitation:</span> {w}
            </p>
          ))}
        </div>
      )}

      {delta.summary.trim().length > 0 && (
        <p className="mb-3 text-[13px] text-slate-700">{delta.summary}</p>
      )}

      {delta.changes.length === 0 ? (
        <p className="text-[12px] italic text-slate-500">
          No material qualitative change detected versus the annual baseline.
        </p>
      ) : (
        <ul className="space-y-3">
          {delta.changes.map((ch, i) => {
            const dir = DIRECTION_META[ch.direction];
            return (
              <li key={i} className="rounded-md border border-slate-200 p-2.5">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-[12px] font-semibold text-slate-800">{ch.area}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${dir.cls}`}>
                    {dir.label}
                  </span>
                </div>
                <p className="mb-2 text-[13px] text-slate-700">{ch.change}</p>
                <div className="space-y-1 text-[11px]">
                  <div className="border-l-2 border-slate-300 pl-2">
                    <span className="font-semibold text-slate-500">
                      10-Q · {ch.tenqCitation.section}:
                    </span>{' '}
                    <span className="italic text-slate-600">&ldquo;{ch.tenqCitation.quote}&rdquo;</span>
                  </div>
                  <div className="border-l-2 border-slate-300 pl-2">
                    <span className="font-semibold text-slate-500">
                      10-K · {ch.tenkCitation.section}:
                    </span>{' '}
                    <span className="italic text-slate-600">&ldquo;{ch.tenkCitation.quote}&rdquo;</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </DeepSection>
  );
}
