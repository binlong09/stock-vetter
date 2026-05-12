import type { ReverseDcfReport } from '@stock-vetter/schema';
import { pct, signedPct, money } from '@/lib/format';

/**
 * The reverse-DCF sensitivity grid: rows = discount rate, cols = terminal P/FCF
 * multiple, cell = the 10-year FCF CAGR at which a DCF equals today's market cap.
 * Plus the deterministic narrative the pipeline wrote.
 */
export function ReverseDcfGrid({ report }: { report: ReverseDcfReport }) {
  const discountRates = [...new Set(report.grid.map((c) => c.discountRate))].sort((a, b) => a - b);
  const terminals = [...new Set(report.grid.map((c) => c.terminalMultiple))].sort((a, b) => a - b);
  const cell = (dr: number, tm: number) =>
    report.grid.find((c) => c.discountRate === dr && c.terminalMultiple === tm)?.impliedFcfCagr ??
    null;

  function cagrColor(v: number | null): string {
    if (v == null) return 'text-slate-300';
    if (v > 0.15) return 'text-rose-600'; // demanding a lot
    if (v > 0.08) return 'text-amber-600';
    return 'text-emerald-700';
  }

  return (
    <div className="text-[12px] text-slate-600">
      <p className="leading-snug">{report.narrative}</p>

      <div className="mt-2.5 overflow-x-auto">
        <table className="w-full border-collapse text-center text-[11px]">
          <thead>
            <tr>
              <th className="px-1.5 py-1 text-left font-medium text-slate-400">disc. ↓ / term. →</th>
              {terminals.map((tm) => (
                <th key={tm} className="px-1.5 py-1 font-medium text-slate-500">
                  {tm}×
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {discountRates.map((dr) => (
              <tr key={dr} className="border-t border-slate-100">
                <td className="px-1.5 py-1.5 text-left font-medium text-slate-500">{pct(dr, 0)}</td>
                {terminals.map((tm) => {
                  const v = cell(dr, tm);
                  return (
                    <td
                      key={tm}
                      className={`px-1.5 py-1.5 font-mono tabular-nums ${cagrColor(v)}`}
                    >
                      {v == null ? '—' : pct(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[10px] leading-snug text-slate-400">
        Each cell: the annual FCF growth (10 yrs) that makes a DCF at that discount rate and
        terminal multiple equal today&apos;s market cap. Higher = the price is assuming more.
      </p>

      <dl className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[11px]">
        <div>
          <dt className="inline text-slate-400">Price: </dt>
          <dd className="inline tabular-nums text-slate-700">${report.currentPrice.toFixed(2)}</dd>
        </div>
        <div>
          <dt className="inline text-slate-400">Starting FCF: </dt>
          <dd className="inline tabular-nums text-slate-700">
            {money(report.startingFcfMillions * 1e6)}
          </dd>
        </div>
        {report.actualFcfCagr5y != null && (
          <div>
            <dt className="inline text-slate-400">Actual 5-yr FCF CAGR: </dt>
            <dd className="inline tabular-nums text-slate-700">{signedPct(report.actualFcfCagr5y)}</dd>
          </div>
        )}
        {report.actualFcfCagr3y != null && (
          <div>
            <dt className="inline text-slate-400">Actual 3-yr: </dt>
            <dd className="inline tabular-nums text-slate-700">{signedPct(report.actualFcfCagr3y)}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
