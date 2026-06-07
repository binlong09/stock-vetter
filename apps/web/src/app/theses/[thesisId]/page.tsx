import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getThesisDetail } from '@/signals-queries';
import { ThesisStatusChip } from '@/components/ThesisStatusChip';
import { ReverseDcfGrid } from '@/components/ReverseDcfGrid';
import { healthMeta, directionMeta } from '@/lib/thesis-status';
import { isoDate } from '@/lib/format';

export const revalidate = 300;

export default async function ThesisDetailPage({
  params,
}: {
  params: Promise<{ thesisId: string }>;
}) {
  const { thesisId } = await params;
  const detail = await getThesisDetail(decodeURIComponent(thesisId));
  if (!detail) notFound();

  const { thesis, status, signalsByWatchItem, reverseDcfByTicker } = detail;
  const stateByItem = new Map(status?.watchItems.map((w) => [w.watchItemId, w]) ?? []);

  return (
    <div>
      <Link href="/theses" className="text-xs text-slate-400 hover:text-slate-700">
        ← Theses
      </Link>

      <div className="mt-2 flex items-center justify-between gap-3">
        <h1 className="font-mono text-base font-semibold text-slate-900">{thesis.id}</h1>
        <ThesisStatusChip health={status?.health ?? 'green'} size="lg" />
      </div>
      <p className="mt-2 text-sm text-slate-700">{thesis.claim}</p>
      <div className="mt-1.5 flex items-center gap-3 text-[11px] text-slate-400">
        <span>{thesis.tickers.join(', ')}</span>
        {status ? <span>updated {isoDate(status.updatedAt)}</span> : <span>not yet evaluated</span>}
      </div>

      {/* Watch-items, each with its signals. */}
      <div className="mt-5 space-y-3">
        {thesis.watchItems.map((wi) => {
          const wstate = stateByItem.get(wi.id);
          const signals = signalsByWatchItem.get(wi.id) ?? [];
          return (
            <div key={wi.id} className="rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-3.5 py-2.5">
                <div>
                  <div className="text-sm font-medium text-slate-900">{wi.label}</div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    tripwire: {wi.tripwire}
                  </div>
                </div>
                <ThesisStatusChip health={wstate?.health ?? 'green'} />
              </div>

              <div className="px-3.5 py-2.5">
                {signals.length === 0 ? (
                  <p className="text-xs text-slate-400">No signals this cycle.</p>
                ) : (
                  <ul className="space-y-3">
                    {signals.map((s) => {
                      const dm = directionMeta(s.direction);
                      return (
                        <li key={s.eventDedupKey} className="text-sm">
                          <div className="flex items-center gap-2">
                            <span className={`font-medium ${dm.text}`}>
                              {dm.glyph} {dm.label}
                            </span>
                            <span className="text-xs text-slate-500">
                              magnitude {s.magnitude.toFixed(2)} · {s.confidence} confidence
                            </span>
                          </div>
                          <p className="mt-1 text-slate-700">{s.rationale}</p>
                          <blockquote className="mt-1 border-l-2 border-slate-200 pl-2 text-xs italic text-slate-500">
                            “{s.citation}”
                          </blockquote>
                          {/* dataQuality stamp — surfaced visibly: it's how the
                              annual-vs-quarterly data question gets judged. */}
                          <div className="mt-1.5 inline-flex rounded bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500">
                            data quality: {s.dataQuality}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Reverse-DCF per analyzed ticker — the "priced-in vs gravy" context. */}
      {reverseDcfByTicker.size > 0 ? (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-slate-900">Reverse DCF</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            What the current price already requires — context for the priced-in check.
          </p>
          <div className="mt-2 space-y-4">
            {[...reverseDcfByTicker.entries()].map(([ticker, report]) => (
              <div key={ticker}>
                <div className="mb-1 text-xs font-medium text-slate-600">{ticker}</div>
                <ReverseDcfGrid report={report} />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
