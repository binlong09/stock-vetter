'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { TickerListRow } from '@/queries';
import { verdictMeta, VERDICT_ORDER } from '@/lib/verdict';
import { valuationGap } from '@/lib/anomaly';
import { ValuationGapBadge } from './ValuationGapBadge';

function scoreColor(s: number): string {
  if (s >= 7.5) return 'text-emerald-700';
  if (s >= 5.5) return 'text-amber-700';
  if (s >= 4) return 'text-orange-700';
  return 'text-rose-700';
}

/**
 * The dashboard list with tappable verdict-bucket filter chips. Mobile-first:
 * one row per ticker — ticker / score / verdict pill on the top line, a clamped
 * one-line summary below — sized for "scan 12-20, decide which to open."
 */
export function DashboardList({ rows }: { rows: TickerListRow[] }) {
  const [bucket, setBucket] = useState<string | null>(null);

  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.verdict, (counts.get(r.verdict) ?? 0) + 1);
  const visible = bucket == null ? rows : rows.filter((r) => r.verdict === bucket);

  const chips: { value: string | null; label: string; n: number }[] = [
    { value: null, label: 'All', n: rows.length },
    ...VERDICT_ORDER.filter((v) => counts.has(v)).map((v) => ({
      value: v,
      label: verdictMeta(v).label,
      n: counts.get(v) ?? 0,
    })),
  ];

  return (
    <div>
      <div className="-mx-1 flex flex-wrap gap-1.5 px-1">
        {chips.map((c) => {
          const active = c.value === bucket;
          return (
            <button
              key={c.label}
              type="button"
              onClick={() => setBucket(c.value)}
              className={`rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors ${
                active
                  ? 'border-slate-800 bg-slate-800 text-white'
                  : 'border-slate-300 bg-white text-slate-600 active:bg-slate-100'
              }`}
            >
              {c.label}
              <span className={active ? 'text-slate-300' : 'text-slate-400'}> {c.n}</span>
            </button>
          );
        })}
      </div>

      <ul className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {visible.map((r) => {
          const m = verdictMeta(r.verdict);
          const gap = valuationGap(r.reverseDcfCentralImpliedCagr, r.actualFcf5yCagr);
          return (
            <li key={r.ticker}>
              <Link
                href={`/ticker/${r.ticker}`}
                className="block px-3.5 py-3 active:bg-slate-50"
              >
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-sm font-semibold text-slate-900">{r.ticker}</span>
                  <span className={`text-base font-bold tabular-nums ${scoreColor(r.weightedScore)}`}>
                    {r.weightedScore.toFixed(1)}
                  </span>
                  <span
                    className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${m.pill}`}
                  >
                    <span aria-hidden>{m.emoji}</span>
                    {m.label}
                  </span>
                </div>
                {gap && (
                  <div className="mt-1.5">
                    <ValuationGapBadge gap={gap} size="chip" />
                  </div>
                )}
                <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-slate-500">
                  {r.summary}
                </p>
                {r.analystVideoCount > 0 && (
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {r.analystVideoCount} analyst video{r.analystVideoCount === 1 ? '' : 's'}
                  </p>
                )}
              </Link>
            </li>
          );
        })}
        {visible.length === 0 && (
          <li className="px-3.5 py-6 text-sm text-slate-500">No tickers in this bucket.</li>
        )}
      </ul>
    </div>
  );
}
