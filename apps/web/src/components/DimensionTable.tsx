import type { MetaCard } from '@stock-vetter/schema';
import { UncertaintyDot } from './UncertaintyDot';

/** Display order + human labels for the six value-checklist dimensions. */
const DIMENSIONS: { key: keyof MetaCard['dimensions']; label: string; blurb: string }[] = [
  { key: 'moatDurability', label: 'Moat durability', blurb: 'Can the competitive advantage last?' },
  { key: 'ownerEarningsQuality', label: 'Owner-earnings quality', blurb: 'How real is the reported cash flow?' },
  { key: 'capitalAllocation', label: 'Capital allocation', blurb: 'Is retained capital reinvested well?' },
  { key: 'debtSustainability', label: 'Debt sustainability', blurb: 'Can the balance sheet take a hit?' },
  { key: 'insiderAlignment', label: 'Insider alignment', blurb: 'Is management invested alongside you?' },
  { key: 'cyclicalityAwareness', label: 'Cyclicality awareness', blurb: 'How sensitive to the business cycle?' },
];

function scoreColor(s: number): string {
  if (s >= 7.5) return 'text-emerald-700';
  if (s >= 5.5) return 'text-amber-700';
  if (s >= 4) return 'text-orange-700';
  return 'text-rose-700';
}

export function DimensionTable({ dimensions }: { dimensions: MetaCard['dimensions'] }) {
  return (
    <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
      {DIMENSIONS.map(({ key, label, blurb }) => {
        const d = dimensions[key];
        const downweighted = d.effectiveWeight < 0.999;
        return (
          <li key={key} className="flex items-start gap-3 px-3.5 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-slate-900">{label}</div>
              <div className="mt-0.5 text-[11px] leading-tight text-slate-400">{blurb}</div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                <span>weight {d.effectiveWeight.toFixed(2)}</span>
                {d.range != null && d.range > 0 && <span>· range {d.range.toFixed(1)}</span>}
                <span className="inline-flex items-center gap-1">
                  · <UncertaintyDot uncertainty={d.uncertainty} withLabel range={d.range} />
                </span>
                {downweighted && <span className="text-rose-600">· down-weighted</span>}
              </div>
            </div>
            <div className="flex shrink-0 items-baseline gap-1.5 pt-0.5">
              <span className={`text-lg font-bold tabular-nums ${scoreColor(d.finalScore)}`}>
                {d.finalScore.toFixed(1)}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
