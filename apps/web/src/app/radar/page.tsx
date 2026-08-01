import Link from 'next/link';
import { listRadarSignals } from '@/short-queries';
import { isoDate } from '@/lib/format';

// The deep-dive job status → a compact chip. `done` shows the verdict.
function analysisChip(jobStatus: string | null, verdict: string | null, conviction: number | null): {
  label: string;
  cls: string;
} {
  if (jobStatus === 'done') {
    const v = verdict ?? 'analyzed';
    const cls =
      v === 'actionable-short'
        ? 'border-rose-300 bg-rose-50 text-rose-700'
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

export default async function RadarPage() {
  const rows = await listRadarSignals();
  // Loudest first (critical → low), then most-recently surfaced within a band.
  const sorted = [...rows].sort(
    (a, b) =>
      SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity) ||
      b.firstSeenAt.localeCompare(a.firstSeenAt),
  );

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-base font-semibold text-slate-900">Radar</h1>
        <span className="text-xs text-slate-400">{rows.length} signals</span>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        Deterministic short-side tells across the watchlist — material 8-K items and multi-period
        XBRL deterioration (trends, restatements, distress screens). No model; computed from the
        filers&rsquo; own data. Reflects the last daily sweep.
      </p>

      <div className="mt-3 space-y-2">
        {sorted.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white px-3.5 py-6 text-sm text-slate-500">
            No signals yet. The sweep writes them on its first run (
            <code className="font-mono">pnpm radar</code>).
          </p>
        ) : (
          sorted.map((s) => {
            const chip = analysisChip(s.jobStatus, s.verdict, s.conviction);
            return (
              <Link
                key={s.key}
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
          })
        )}
      </div>
    </div>
  );
}
