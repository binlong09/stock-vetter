import type { MetaCard, FinancialSnapshot } from '@stock-vetter/schema';
import { pct, signedPct, ratio } from '@/lib/format';

/**
 * The "what does today's price assume?" block. Built from the meta-card inputs
 * (reverse-DCF central implied FCF CAGR, actual 5y FCF CAGR) plus the financial
 * snapshot (P/E vs its 10-year median, FCF yield). Written to be readable cold.
 */
export function ValuationContext({
  inputs,
  snapshot,
}: {
  inputs: MetaCard['inputs'];
  snapshot: FinancialSnapshot | null;
}) {
  const implied = inputs.reverseDcfCentralImpliedCagr;
  const actual = inputs.actualFcf5yCagr;
  const pe = snapshot?.peRatio ?? null;
  const peMed = snapshot?.peRatio10yMedian ?? null;
  const fcfYield = snapshot?.fcfYield ?? null;

  // "expensive vs history" signal: current P/E meaningfully above its own median.
  const peVsMedian =
    pe != null && peMed != null
      ? pe > peMed * 1.1
        ? 'above'
        : pe < peMed * 0.9
          ? 'below'
          : 'near'
      : null;

  // "is the price assuming more growth than the company has delivered?"
  const growthGap =
    implied != null && actual != null
      ? implied > actual + 0.02
        ? 'demanding'
        : implied < actual - 0.02
          ? 'forgiving'
          : 'in-line'
      : null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3.5 text-sm">
      <dl className="space-y-2.5">
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-slate-400">
            Reverse DCF — growth the price implies
          </dt>
          <dd className="mt-0.5 text-slate-800">
            At a 10% discount rate and a 20× terminal multiple, today&apos;s price requires{' '}
            <strong className="tabular-nums">{pct(implied)}</strong> annual free-cash-flow growth
            for 10 years.{' '}
            {actual != null && (
              <>
                The company actually grew FCF{' '}
                <strong className="tabular-nums">{signedPct(actual)}</strong>/yr over the last 5
                years
                {growthGap === 'demanding' && (
                  <span className="text-rose-700"> — the price is demanding more than that.</span>
                )}
                {growthGap === 'forgiving' && (
                  <span className="text-emerald-700">
                    {' '}
                    — less than that, so the price isn&apos;t betting on acceleration.
                  </span>
                )}
                {growthGap === 'in-line' && <span> — roughly in line.</span>}
              </>
            )}
            {actual == null && '.'}
          </dd>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2.5">
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-slate-400">P/E vs 10-yr median</dt>
            <dd className="mt-0.5 text-slate-800">
              <span className="tabular-nums">{ratio(pe)}</span>{' '}
              <span className="text-slate-400">vs</span>{' '}
              <span className="tabular-nums">{ratio(peMed)}</span>
              {peVsMedian === 'above' && <span className="text-rose-700"> · richer than usual</span>}
              {peVsMedian === 'below' && (
                <span className="text-emerald-700"> · cheaper than usual</span>
              )}
              {peVsMedian === 'near' && <span className="text-slate-400"> · about normal</span>}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-slate-400">FCF yield</dt>
            <dd className="mt-0.5 tabular-nums text-slate-800">{pct(fcfYield, 2)}</dd>
          </div>
        </div>
      </dl>
      {implied == null && actual == null && pe == null && (
        <p className="mt-1 text-[11px] text-slate-400">
          No valuation data available for this ticker (the reverse DCF needs positive FCF and a
          share count).
        </p>
      )}
    </div>
  );
}
