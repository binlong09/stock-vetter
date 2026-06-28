import Link from 'next/link';
import { listTheses } from '@/signals-queries';
import { ThesisStatusChip } from '@/components/ThesisStatusChip';
import { RunNowButton } from '@/components/RunNowButton';
import { HEALTH_ORDER, healthLegend } from '@/lib/thesis-status';
import { isoDate } from '@/lib/format';

// Reflects whatever the last cron run wrote to Turso.
export const revalidate = 300;

export default async function ThesesPage() {
  const rows = await listTheses();
  // Tripped (red) first, then amber, then green; stable by id within a band.
  const sorted = [...rows].sort(
    (a, b) => HEALTH_ORDER.indexOf(a.health as never) - HEALTH_ORDER.indexOf(b.health as never),
  );
  // Baseline for the run-now poll: the latest status update we currently show.
  const baselineUpdatedAt = rows.reduce<string | null>(
    (max, r) => (r.updatedAt && (!max || r.updatedAt > max) ? r.updatedAt : max),
    null,
  );

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-base font-semibold text-slate-900">Theses</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">{rows.length} watched</span>
          <RunNowButton baselineUpdatedAt={baselineUpdatedAt} />
        </div>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        Signal tracker — a noise filter, not a feed. Status reflects the last scheduled run.
      </p>

      {/* Status legend — each thesis's status maps to an exit decision. */}
      <dl className="mt-3 flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 sm:flex-row sm:flex-wrap sm:gap-x-5">
        {healthLegend().map((m) => (
          <div key={m.label} className="flex items-baseline gap-1.5 text-xs">
            <dt className={`shrink-0 rounded-full border px-2 py-0.5 font-medium ${m.pill}`}>
              {m.emoji} {m.label}
            </dt>
            <dd className="text-slate-500">{m.blurb}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 space-y-2">
        {sorted.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white px-3.5 py-6 text-sm text-slate-500">
            No theses yet. The tracker writes them on its first run (<code className="font-mono">pnpm track</code>).
          </p>
        ) : (
          sorted.map((t) => (
            <Link
              key={t.thesisId}
              href={`/theses/${encodeURIComponent(t.thesisId)}`}
              className="block rounded-lg border border-slate-200 bg-white px-3.5 py-3 hover:border-slate-300"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-sm font-medium text-slate-900">{t.thesisId}</span>
                <ThesisStatusChip health={t.health} />
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-slate-600">{t.claim}</p>
              <div className="mt-1.5 flex items-center gap-3 text-[11px] text-slate-400">
                <span>{t.tickers.join(', ')}</span>
                {t.updatedAt ? <span>updated {isoDate(t.updatedAt)}</span> : <span>not yet run</span>}
                {t.trippedWatchItemIds.length > 0 ? (
                  <span className="text-rose-600">
                    {t.trippedWatchItemIds.length} tripwire{t.trippedWatchItemIds.length > 1 ? 's' : ''} crossed
                  </span>
                ) : null}
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
