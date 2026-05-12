import type { FinancialSnapshot } from '@stock-vetter/schema';
import { money, ratio, pct } from '@/lib/format';

/**
 * The financial snapshot: current price/multiples up top, then the up-to-10-year
 * annual table (revenue / EBIT / net income / FCF / share count). Wrapped in an
 * x-scroll on narrow screens rather than truncating columns.
 */
export function HistoricalFinancials({ snapshot }: { snapshot: FinancialSnapshot }) {
  const rows = [...snapshot.annual].sort((a, b) => b.year - a.year);
  return (
    <div className="text-[12px] text-slate-600">
      <dl className="flex flex-wrap gap-x-5 gap-y-1.5 text-[11px]">
        <Item label="Price" value={snapshot.price != null ? `$${snapshot.price.toFixed(2)}` : 'n/a'} />
        <Item label="Market cap" value={money(snapshot.marketCap)} />
        <Item label="EV" value={money(snapshot.enterpriseValue)} />
        <Item label="Net cash" value={money(snapshot.netCash)} />
        <Item label="P/E" value={ratio(snapshot.peRatio)} />
        <Item label="P/E 10-yr median" value={ratio(snapshot.peRatio10yMedian)} />
        <Item label="EV/EBIT" value={ratio(snapshot.evEbit)} />
        <Item label="EV/EBIT 10-yr median" value={ratio(snapshot.evEbit10yMedian)} />
        <Item label="EV/Sales" value={ratio(snapshot.evSales)} />
        <Item label="FCF yield" value={pct(snapshot.fcfYield, 2)} />
      </dl>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-right text-[11px] tabular-nums">
          <thead>
            <tr className="text-slate-400">
              <th className="px-2 py-1 text-left">Year</th>
              <th className="px-2 py-1">Revenue</th>
              <th className="px-2 py-1">EBIT</th>
              <th className="px-2 py-1">Net income</th>
              <th className="px-2 py-1">FCF</th>
              <th className="px-2 py-1">Shares</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.year} className="border-t border-slate-100">
                <td className="px-2 py-1 text-left font-medium text-slate-500">{r.year}</td>
                <td className="px-2 py-1 text-slate-700">{money(r.revenue)}</td>
                <td className="px-2 py-1 text-slate-700">{money(r.ebit)}</td>
                <td className="px-2 py-1 text-slate-700">{money(r.netIncome)}</td>
                <td className="px-2 py-1 text-slate-700">{money(r.fcf)}</td>
                <td className="px-2 py-1 text-slate-700">
                  {r.sharesOutstanding ? `${(r.sharesOutstanding / 1e6).toFixed(0)}M` : 'n/a'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[10px] text-slate-400">
        As of {snapshot.asOf}. Annual figures from SEC companyfacts; medians need ≥5 paired years
        of price + fundamentals or they show n/a.
      </p>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="inline text-slate-400">{label}: </dt>
      <dd className="inline text-slate-700">{value}</dd>
    </div>
  );
}
