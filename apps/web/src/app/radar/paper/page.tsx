import Link from 'next/link';
import {
  buildPortfolio,
  type PaperLeg,
  type PortfolioSummary,
  type PositionValuation,
} from '@stock-vetter/schema';
import { listPaperPositions, listPaperMarks, companyNamesByTicker } from '@/paper-queries';
import { isoDate, pct, signedPct, usd } from '@/lib/format';
import { RadarTabs } from '../tabs';

// Marks are refreshed by the sweep, which runs several times through the
// session — so this page is roughly as live as the radar itself.
export const revalidate = 300;

function money(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x)) return 'n/a';
  const sign = x < 0 ? '−' : '';
  return `${sign}$${Math.abs(x).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

const upDown = (x: number | null | undefined): string =>
  x == null ? 'text-slate-400' : x > 0 ? 'text-emerald-600' : x < 0 ? 'text-rose-600' : 'text-slate-600';

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`text-sm font-medium ${cls ?? 'text-slate-800'}`}>{value}</div>
    </div>
  );
}

function SummaryCard({ s, benchmark }: { s: PortfolioSummary; benchmark: string }) {
  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3.5 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <span className={`text-2xl font-semibold ${upDown(s.returnPct)}`}>
            {signedPct(s.returnPct)}
          </span>
          <span className="ml-2 text-sm text-slate-500">
            {money(s.costBasis)} → {money(s.marketValue)}
          </span>
        </div>
        <div className="text-xs text-slate-500">
          {benchmark} {signedPct(s.benchmarkReturnPct)} · alpha{' '}
          <span className={`font-medium ${upDown(s.alphaPct)}`}>{signedPct(s.alphaPct)}</span>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-6">
        <Stat label="P&L" value={money(s.pnl)} cls={upDown(s.pnl)} />
        <Stat label="win rate" value={pct(s.winRate, 0)} />
        <Stat label="beat bmk" value={pct(s.beatBenchmarkRate, 0)} />
        <Stat label="median" value={signedPct(s.medianReturnPct)} cls={upDown(s.medianReturnPct)} />
        <Stat label="avg hold" value={s.avgHoldingDays == null ? 'n/a' : `${s.avgHoldingDays.toFixed(0)}d`} />
        <Stat label="valued" value={String(s.valued)} />
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        {s.open} open · {s.closed} closed
        {s.closed > 0 ? ' (valued at their exit)' : ''}
        {s.pending > 0 ? ` · ${s.pending} awaiting a fill` : ''}
      </p>
    </div>
  );
}

function PositionRow({ v, company }: { v: PositionValuation; company: string | null }) {
  const p = v.position;
  return (
    <Link
      href={`/radar/${encodeURIComponent(p.accession)}`}
      className="block rounded-lg border border-slate-200 bg-white px-3.5 py-3 hover:border-slate-300"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="font-mono text-sm font-medium text-slate-900">{p.ticker}</span>
          {company ? <span className="truncate text-[11px] text-slate-500">{company}</span> : null}
          {p.conviction != null ? (
            <span className="shrink-0 text-[11px] text-slate-400">{p.conviction}/10</span>
          ) : null}
          {p.status === 'closed' ? (
            <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-1.5 text-[10px] text-slate-500">
              closed
            </span>
          ) : null}
        </span>
        <span className={`shrink-0 text-sm font-semibold ${upDown(v.returnPct)}`}>
          {v.filled ? signedPct(v.returnPct) : 'awaiting fill'}
        </span>
      </div>
      {p.thesis ? <p className="mt-1 line-clamp-2 text-xs text-slate-600">{p.thesis}</p> : null}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
        {v.filled ? (
          <>
            <span>
              {usd(p.entryPrice)} on {p.entryDate} → {usd(v.markPrice)}
              {v.markDate ? ` on ${v.markDate}` : ''}
            </span>
            <span className={upDown(v.pnl)}>{money(v.pnl)}</span>
            <span title={`versus ${p.benchmark} over the same window`}>
              vs {p.benchmark} {signedPct(v.alphaPct)}
            </span>
            <span>{v.holdingDays ?? '?'}d held</span>
          </>
        ) : (
          <span>
            verdict {isoDate(p.verdictAt)} — fills at the first close on or after it
          </span>
        )}
        <span>{p.form}</span>
        {p.model ? <span className="font-mono">{p.model}</span> : null}
      </div>
    </Link>
  );
}

export default async function PaperPage({
  searchParams,
}: {
  searchParams: Promise<{ leg?: string }>;
}) {
  const legParam = (await searchParams).leg;
  const leg: PaperLeg = legParam === 'alt' ? 'alt' : 'primary';

  const all = await listPaperPositions();
  const benchmark = all[0]?.benchmark ?? 'IWM';
  const marks = await listPaperMarks([...new Set([...all.map((p) => p.ticker), benchmark])]);
  const names = await companyNamesByTicker([...new Set(all.map((p) => p.ticker))]);

  const positions = all.filter((p) => p.leg === leg);
  const { valuations, summary } = buildPortfolio(positions, marks, benchmark);
  const hasAlt = all.some((p) => p.leg === 'alt');
  // The challenger's book, summarized, so the model comparison can be read as
  // money rather than as a count of disagreements.
  const altSummary = hasAlt
    ? buildPortfolio(
        all.filter((p) => p.leg === 'alt'),
        marks,
        benchmark,
      ).summary
    : null;
  const primarySummary =
    leg === 'primary'
      ? summary
      : buildPortfolio(
          all.filter((p) => p.leg === 'primary'),
          marks,
          benchmark,
        ).summary;

  const models = [...new Set(positions.map((p) => p.model).filter(Boolean))].join(', ');
  const sorted = [...valuations].sort(
    (a, b) => (b.returnPct ?? -Infinity) - (a.returnPct ?? -Infinity),
  );

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-base font-semibold text-slate-900">Radar</h1>
        <span className="text-xs text-slate-400">
          {positions.length} mock position{positions.length === 1 ? '' : 's'}
        </span>
      </div>

      <RadarTabs active="paper" />

      <p className="mt-2 text-xs text-slate-400">
        One rule, applied without discretion: every deep-dive verdict of{' '}
        <span className="text-emerald-600">mispriced-long</span> is bought at{' '}
        {money(positions[0]?.notional ?? 10000)} and held. The fill is the first daily close at or
        after the verdict — the price you could actually have gotten by acting on it when you saw
        it. Returns use split- and dividend-adjusted closes, and each position is measured against{' '}
        {benchmark} over its own holding window. Nothing here is a decision anyone made, which is
        the point: it measures the pipeline, not the operator. Paper only — no slippage, no spread,
        and small-cap liquidity is ignored.
      </p>

      {hasAlt ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(['primary', 'alt'] as const).map((k) => (
            <Link
              key={k}
              href={k === 'primary' ? '/radar/paper' : '/radar/paper?leg=alt'}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                leg === k
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              {k === 'primary' ? 'Primary' : 'Challenger'}{' '}
              <span className={leg === k ? 'text-slate-300' : 'text-slate-400'}>
                {all.filter((p) => p.leg === k).length}
              </span>
            </Link>
          ))}
        </div>
      ) : null}

      {positions.length === 0 ? (
        <p className="mt-4 rounded-lg border border-slate-200 bg-white px-3.5 py-6 text-sm text-slate-500">
          No mock positions yet. They open themselves — the next deep-dive that returns
          mispriced-long becomes one, and the sweep prices it on its next run.
        </p>
      ) : (
        <>
          {models ? (
            <p className="mt-3 text-[11px] text-slate-400">
              {leg === 'primary' ? 'Verdicts from' : 'Challenger verdicts from'}{' '}
              <span className="font-mono">{models}</span>
            </p>
          ) : null}
          <SummaryCard s={summary} benchmark={benchmark} />

          {altSummary && primarySummary.valued > 0 && altSummary.valued > 0 ? (
            <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-[11px] text-slate-500">
              Model scoreboard: primary {signedPct(primarySummary.returnPct)} over{' '}
              {primarySummary.valued} pick{primarySummary.valued === 1 ? '' : 's'} · challenger{' '}
              {signedPct(altSummary.returnPct)} over {altSummary.valued}. Different picks, so this
              compares books, not the same trade twice.
            </p>
          ) : null}

          <div className="mt-3 space-y-2">
            {sorted.map((v) => (
              <PositionRow key={v.position.id} v={v} company={names.get(v.position.ticker) ?? null} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
