import { listTickers } from '@/queries';

// Data only changes when the CLI runs; a short ISR window keeps reads snappy.
export const revalidate = 300;

export default async function DashboardPage() {
  const tickers = await listTickers();
  return (
    <div>
      <h1 className="text-base font-semibold text-slate-900">
        Tickers <span className="font-normal text-slate-400">({tickers.length})</span>
      </h1>
      <ul className="mt-4 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {tickers.map((t) => (
          <li key={t.ticker} className="flex items-baseline gap-3 px-4 py-3">
            <span className="font-mono text-sm font-semibold text-slate-900">{t.ticker}</span>
            <span className="text-sm tabular-nums text-slate-700">
              {t.weightedScore.toFixed(1)}
            </span>
            <span className="text-xs text-slate-500">{t.verdict}</span>
          </li>
        ))}
        {tickers.length === 0 && (
          <li className="px-4 py-6 text-sm text-slate-500">
            Nothing here yet. Run <code className="font-mono">pnpm push-fixtures</code> or analyze a
            ticker.
          </li>
        )}
      </ul>
    </div>
  );
}
