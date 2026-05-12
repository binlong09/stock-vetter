import type { ValuationGap } from '@/lib/anomaly';
import { signedPct } from '@/lib/format';

/**
 * Surfaces a wide reverse-DCF-implied vs actual FCF-growth gap. Two sizes:
 * `chip` for dashboard rows (compact), `full` for the ticker-page header (with
 * a one-line explanation). Doesn't touch the score — just flags the signal.
 */
export function ValuationGapBadge({
  gap,
  size = 'chip',
}: {
  gap: ValuationGap;
  size?: 'chip' | 'full';
}) {
  const nums = `implied ${signedPct(gap.impliedCagr)} vs actual ${signedPct(gap.actualCagr)}`;
  if (size === 'chip') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900"
        title={`Reverse DCF: ${nums} 5-yr FCF growth — a ${Math.abs(gap.gapPp).toFixed(0)}pp gap`}
      >
        ⚡ pricing anomaly
      </span>
    );
  }
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] leading-snug text-amber-900">
      <span className="font-semibold">⚡ Valuation gap.</span>{' '}
      The reverse DCF implies ~<strong>{signedPct(gap.impliedCagr)}</strong> annual FCF growth over
      the next decade, but the company actually grew FCF{' '}
      <strong>{signedPct(gap.actualCagr)}</strong>/yr over the last 5 — a{' '}
      {Math.abs(gap.gapPp).toFixed(0)}-point gap. The market is pricing in{' '}
      {gap.direction === 'below' ? 'far less than it has delivered' : 'far more than it has delivered'}
      . (Doesn&apos;t change the score — it&apos;s a flag to investigate, not a verdict.)
    </div>
  );
}
