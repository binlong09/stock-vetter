import { listTickers } from '@/queries';
import { DashboardList } from '@/components/DashboardList';

// Data only changes when the CLI runs. (The layout's auth() call opts the route
// into dynamic rendering anyway, so this is mostly a no-op — kept for intent.)
export const revalidate = 300;

export default async function DashboardPage() {
  const rows = await listTickers();
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h1 className="text-base font-semibold text-slate-900">Tickers</h1>
        <span className="text-xs text-slate-400">{rows.length} analyzed</span>
      </div>
      <div className="mt-3">
        {rows.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white px-3.5 py-6 text-sm text-slate-500">
            Nothing here yet. Run <code className="font-mono">pnpm push-fixtures</code> or analyze a
            ticker.
          </p>
        ) : (
          <DashboardList rows={rows} />
        )}
      </div>
    </div>
  );
}
