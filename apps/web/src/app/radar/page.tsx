import Link from 'next/link';
import { listRadarSignals, type RadarRow } from '@/radar-queries';
import { isoDate } from '@/lib/format';

// The deep-dive job status → a compact chip. `done` shows the verdict.
function analysisChip(jobStatus: string | null, verdict: string | null, conviction: number | null): {
  label: string;
  cls: string;
} {
  if (jobStatus === 'done') {
    const v = verdict ?? 'analyzed';
    const cls =
      v === 'mispriced-short'
        ? 'border-rose-300 bg-rose-50 text-rose-700'
        : v === 'mispriced-long'
          ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
          : v === 'watchlist'
            ? 'border-amber-300 bg-amber-50 text-amber-700'
            : 'border-slate-300 bg-slate-100 text-slate-600';
    return { label: conviction != null && verdict ? `${v} ${conviction}/10` : v, cls };
  }
  if (jobStatus === 'running') return { label: 'analyzing…', cls: 'border-sky-300 bg-sky-50 text-sky-700' };
  if (jobStatus === 'pending') return { label: 'queued', cls: 'border-amber-300 bg-amber-50 text-amber-700' };
  if (jobStatus === 'failed') return { label: 'analysis failed', cls: 'border-rose-300 bg-rose-50 text-rose-700' };
  return { label: 'not queued', cls: 'border-slate-200 bg-slate-50 text-slate-400' };
}

// Reflects whatever the last daily sweep wrote to Turso.
export const revalidate = 300;

const SEV_ORDER = ['critical', 'high', 'medium', 'low'];
const SEV_PILL: Record<string, string> = {
  critical: 'border-rose-300 bg-rose-50 text-rose-700',
  high: 'border-orange-300 bg-orange-50 text-orange-700',
  medium: 'border-amber-300 bg-amber-50 text-amber-700',
  low: 'border-slate-300 bg-slate-50 text-slate-600',
};
const KIND_LABEL: Record<string, string> = {
  '8k-item': '8-K item',
  trend: 'trend',
  restatement: 'restatement',
  composite: 'composite',
  dilution: 'dilution',
  runway: 'cash runway',
  offering: 'offering',
  'late-filing': 'late filing',
  ownership: 'ownership',
  'insider-buy': 'insider buying',
  buyback: 'buyback',
  inflection: 'inflection',
  uplisting: 'uplisting',
};

// Which way the signal cuts. Small-cap catalysts genuinely go both ways — a
// tender offer and a shelf takedown are both loud — so direction gets its own
// mark rather than being implied by the feed's name.
const DIRECTION: Record<string, { mark: string; cls: string; title: string }> = {
  bearish: { mark: '▼', cls: 'text-rose-500', title: 'bearish' },
  bullish: { mark: '▲', cls: 'text-emerald-500', title: 'bullish' },
  ambiguous: { mark: '◆', cls: 'text-slate-400', title: 'direction depends on terms' },
};

function capLabel(marketCap: number | null): string | null {
  if (marketCap == null || marketCap <= 0) return null;
  return marketCap >= 1e9 ? `$${(marketCap / 1e9).toFixed(1)}B` : `$${(marketCap / 1e6).toFixed(0)}M`;
}

// Group signals by filing date, newest date first; loudest first within a day.
function groupByFilingDate(rows: RadarRow[]): Array<{ date: string; signals: RadarRow[] }> {
  const byDate = new Map<string, RadarRow[]>();
  for (const r of rows) {
    const date = isoDate(r.filingDate);
    const list = byDate.get(date);
    if (list) list.push(r);
    else byDate.set(date, [r]);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, signals]) => ({
      date,
      signals: signals.sort(
        (a, b) =>
          SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity) ||
          b.firstSeenAt.localeCompare(a.firstSeenAt),
      ),
    }));
}

function severityCounts(signals: RadarRow[]): Array<{ severity: string; count: number }> {
  return SEV_ORDER.map((severity) => ({
    severity,
    count: signals.filter((s) => s.severity === severity).length,
  })).filter((c) => c.count > 0);
}

function SignalCard({ s }: { s: RadarRow }) {
  const chip = analysisChip(s.jobStatus, s.verdict, s.conviction);
  const dir = DIRECTION[s.direction] ?? DIRECTION.bearish!;
  const cap = capLabel(s.marketCap);
  return (
    <Link
      href={`/radar/${encodeURIComponent(s.accession)}`}
      className="block rounded-lg border border-slate-200 bg-white px-3.5 py-3 hover:border-slate-300"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-baseline gap-1.5">
          <span className={`text-[11px] ${dir.cls}`} title={dir.title}>
            {dir.mark}
          </span>
          <span className="font-mono text-sm font-medium text-slate-900">{s.ticker}</span>
          {s.focus ? (
            <span className="text-[11px] text-amber-500" title="on the focus list">
              ★
            </span>
          ) : null}
          {cap ? <span className="text-[11px] text-slate-400">{cap}</span> : null}
        </span>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${SEV_PILL[s.severity] ?? SEV_PILL.low}`}
        >
          {s.severity}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-700">{s.headline}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
        <span>{s.form}</span>
        <span>{KIND_LABEL[s.kind] ?? s.kind}</span>
        <span>filed {isoDate(s.filingDate)}</span>
        <span>seen {isoDate(s.firstSeenAt)}</span>
        <span className={`rounded-full border px-1.5 py-0.5 font-medium ${chip.cls}`}>{chip.label}</span>
      </div>
    </Link>
  );
}

// The view filters, as links rather than client state — the page is a server
// component and a searchParam keeps it shareable and back-button-correct.
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
  const groups = groupByFilingDate(rows);
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

      <div className="mt-2 flex flex-wrap gap-1.5">
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

      <div className="mt-3 space-y-3">
        {groups.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white px-3.5 py-6 text-sm text-slate-500">
            {all.length === 0 ? (
              <>
                No signals yet. The sweep writes them on its first run (
                <code className="font-mono">pnpm radar</code>).
              </>
            ) : (
              <>
                Nothing matches this view.{' '}
                <Link href="/radar" className="underline">
                  Show all {all.length}
                </Link>
                .
              </>
            )}
          </p>
        ) : (
          groups.map((g, i) => (
            <details
              key={g.date}
              open={i === 0}
              className="group rounded-lg border border-slate-200 bg-slate-50 open:bg-transparent"
            >
              <summary className="flex cursor-pointer select-none list-none items-center gap-2 px-3.5 py-2.5 text-sm [&::-webkit-details-marker]:hidden">
                <span className="text-[10px] text-slate-400 transition-transform group-open:rotate-90">▶</span>
                <span className="font-medium text-slate-900">filed {g.date}</span>
                <span className="text-xs text-slate-400">
                  {g.signals.length} signal{g.signals.length === 1 ? '' : 's'}
                </span>
                <span className="ml-auto flex items-center gap-1.5">
                  {severityCounts(g.signals).map(({ severity, count }) => (
                    <span
                      key={severity}
                      className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${SEV_PILL[severity] ?? SEV_PILL.low}`}
                    >
                      {count} {severity}
                    </span>
                  ))}
                </span>
              </summary>
              <div className="space-y-2 px-3.5 pb-3.5 pt-1">
                {g.signals.map((s) => (
                  <SignalCard key={s.key} s={s} />
                ))}
              </div>
            </details>
          ))
        )}
      </div>
    </div>
  );
}
