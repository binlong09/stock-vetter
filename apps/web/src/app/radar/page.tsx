import Link from 'next/link';
import { listRadarSignals, type RadarRow } from '@/radar-queries';
import { RadarFeed } from './radar-feed';
import { RadarTabs } from './tabs';

// Reflects whatever the last daily sweep wrote to Turso.
export const revalidate = 300;

// The view filters, as links rather than client state — a searchParam keeps
// them shareable and back-button-correct. Ticker search is the opposite case
// and lives in the client component: it's ephemeral, per-keystroke, and wants
// no round trip. Switching view therefore clears the search, which is the
// right default — a new view is a fresh look at the feed.
const VIEWS = [
  { key: '', label: 'All' },
  { key: 'focus', label: '★ Focus' },
  { key: 'bullish', label: '▲ Green flags' },
  { key: 'bearish', label: '▼ Warnings' },
] as const;

function applyView(rows: RadarRow[], view: string): RadarRow[] {
  if (view === 'focus') return rows.filter((r) => r.focus);
  if (view === 'bullish' || view === 'bearish' || view === 'ambiguous') {
    return rows.filter((r) => r.direction === view);
  }
  return rows;
}

export default async function RadarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const view = (await searchParams).view ?? '';
  const all = await listRadarSignals();
  const rows = applyView(all, view);
  const counts = {
    focus: all.filter((r) => r.focus).length,
    bullish: all.filter((r) => r.direction === 'bullish').length,
    bearish: all.filter((r) => r.direction === 'bearish').length,
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-base font-semibold text-slate-900">Radar</h1>
        <span className="text-xs text-slate-400">
          {rows.length}
          {rows.length !== all.length ? ` of ${all.length}` : ''} signals
        </span>
      </div>

      <RadarTabs active="signals" />

      <div className="mt-3 flex flex-wrap gap-1.5">
        {VIEWS.map((v) => {
          const active = view === v.key;
          const n =
            v.key === '' ? all.length : counts[v.key as 'focus' | 'bullish' | 'bearish'];
          return (
            <Link
              key={v.key || 'all'}
              href={v.key ? `/radar?view=${v.key}` : '/radar'}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                active
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              {v.label} <span className={active ? 'text-slate-300' : 'text-slate-400'}>{n}</span>
            </Link>
          );
        })}
      </div>
      <p className="mt-1 text-xs text-slate-400">
        Filing catalysts across the small-cap tech watchlist — 8-K events, shelf registrations
        and takedowns, listing and late-filing notices, share-count expansion, cash runway, and
        multi-period XBRL moves, and the bullish side too — insider buying clusters, buybacks,
        uplistings, and fundamental inflections (first profit or free cash flow after a loss run,
        revenue growth accelerating). No model; computed from the
        filers&rsquo; own data. Materiality is judged relative to market cap, so an item that is
        noise at $500B surfaces at $200M. <span className="text-amber-500">★</span> marks the
        focus list — names whose story you already know, and the only ones queued for a deep-dive.
        <span className="text-rose-400"> ▼</span> bearish,
        <span className="text-emerald-400"> ▲</span> bullish,
        <span className="text-slate-400"> ◆</span> depends on terms. Each is a candidate for a
        deep-dive that judges whether it&rsquo;s mispriced, which way, and on what catalyst.
      </p>

      <RadarFeed rows={rows} totalCount={all.length} />
    </div>
  );
}
