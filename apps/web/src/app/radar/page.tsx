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
};

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
  return (
    <Link
      href={`/radar/${encodeURIComponent(s.accession)}`}
      className="block rounded-lg border border-slate-200 bg-white px-3.5 py-3 hover:border-slate-300"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-sm font-medium text-slate-900">{s.ticker}</span>
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

export default async function RadarPage() {
  const rows = await listRadarSignals();
  const groups = groupByFilingDate(rows);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-base font-semibold text-slate-900">Radar</h1>
        <span className="text-xs text-slate-400">{rows.length} signals</span>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        Material filing changes across the watchlist — 8-K events and multi-period XBRL moves
        (trends, restatements, distress screens). No model; computed from the filers&rsquo; own
        data. Each is a candidate for a deep-dive that judges whether it&rsquo;s mispriced, which
        way, and on what catalyst. Reflects the last daily sweep.
      </p>

      <div className="mt-3 space-y-3">
        {groups.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white px-3.5 py-6 text-sm text-slate-500">
            No signals yet. The sweep writes them on its first run (
            <code className="font-mono">pnpm radar</code>).
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
