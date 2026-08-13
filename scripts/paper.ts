#!/usr/bin/env tsx
/**
 * scripts/paper.ts
 *
 * The mock-buy portfolio: what the radar's `mispriced-long` verdicts would
 * have made you.
 *
 * One rule, no discretion — every deep-dive that returns `mispriced-long` is
 * bought at a fixed notional, filled at the first daily close at or after the
 * verdict, and held. Positions are derived from `radar_jobs`, never entered by
 * hand, so the number this prints measures the PIPELINE rather than anyone's
 * taste in which flagged names to act on. Returns come off adjusted closes
 * (reverse splits are routine in this universe) and are shown against IWM over
 * each position's own window, because "up 9%" means nothing without knowing
 * what small caps did over the same weeks.
 *
 *   pnpm paper                       # refresh prices, open anything new, print the book
 *   pnpm paper report                # print from stored marks only (no network)
 *   pnpm paper sync                  # refresh only, no report
 *   pnpm paper --leg=alt             # the challenger model's shadow book
 *   pnpm paper --leg=all             # both, side by side
 *   pnpm paper close TICKER --reason="thesis broke"
 *
 * Sizing and benchmark: PAPER_NOTIONAL (default 100 — the size is a measuring
 * stick, not a portfolio; every figure printed is a percentage), PAPER_BENCHMARK
 * (default IWM). PAPER_TRACK_ALT=0 stops the challenger leg being tracked.
 * The radar sweep calls the same refresh, so this CLI is for reading the book
 * and for the rare manual close — not something you need to schedule.
 */
import 'dotenv/config';
import {
  isTursoConfigured,
  refreshPaperPortfolio,
  listPaperPositions,
  listPaperMarks,
  closePaperPositions,
  paperBenchmark,
  paperNotional,
} from '@stock-vetter/pipeline';
import {
  buildPortfolio,
  type PaperLeg,
  type PortfolioSummary,
  type PositionValuation,
} from '@stock-vetter/schema';

const arg = (n: string): string | undefined => {
  const i = process.argv.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  if (i === -1) return undefined;
  const a = process.argv[i]!;
  if (a.includes('=')) return a.slice(a.indexOf('=') + 1);
  const next = process.argv[i + 1];
  return next && !next.startsWith('--') ? next : 'true';
};
const out = (s: string): void => void process.stdout.write(s);
const err = (s: string): void => void process.stderr.write(s);

const pct = (x: number | null, digits = 1): string =>
  x == null ? '   n/a' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(digits)}%`;
/** Unsigned — a win rate is a share, not a change, and "+100%" reads as a double. */
const rate = (x: number | null): string => (x == null ? 'n/a' : `${(x * 100).toFixed(0)}%`);
const usd = (x: number | null): string => (x == null ? 'n/a' : `$${x.toFixed(2)}`);
// Cents matter at the default $100-a-position measuring stick, and are noise at
// a larger PAPER_NOTIONAL — so the precision follows the magnitude.
const money = (x: number | null): string => {
  if (x == null) return 'n/a';
  const abs = Math.abs(x);
  const digits = abs < 1000 ? 2 : 0;
  return `${x < 0 ? '-' : ''}$${abs.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
};

function printSummary(label: string, s: PortfolioSummary): void {
  out(`\n${label}\n${'═'.repeat(label.length)}\n`);
  if (!s.valued) {
    out(
      s.pending
        ? `${s.pending} position(s) opened, none priced yet — the fill is the first close at or after the verdict.\n`
        : 'No positions yet. A deep-dive returning mispriced-long opens one.\n',
    );
    return;
  }
  out(
    `${s.valued} valued position(s)${s.pending ? ` (+${s.pending} awaiting a fill)` : ''} · ` +
      `${s.open} open, ${s.closed} closed\n`,
  );
  out(`cost basis ${money(s.costBasis)} → value ${money(s.marketValue)}  (${money(s.pnl)}, ${pct(s.returnPct)})\n`);
  out(
    `vs ${paperBenchmark()}: ${pct(s.benchmarkReturnPct)} over the same windows → ` +
      `alpha ${pct(s.alphaPct)}\n`,
  );
  out(
    `win rate ${rate(s.winRate)} · beat benchmark ${rate(s.beatBenchmarkRate)} · ` +
      `median ${pct(s.medianReturnPct)} · avg hold ${s.avgHoldingDays?.toFixed(0) ?? 'n/a'}d\n`,
  );
  if (s.best) out(`best  ${s.best.position.ticker} ${pct(s.best.returnPct)}\n`);
  if (s.worst) out(`worst ${s.worst.position.ticker} ${pct(s.worst.returnPct)}\n`);
}

function printPositions(vals: PositionValuation[]): void {
  if (!vals.length) return;
  out('\n');
  const rows = [...vals].sort((a, b) => (b.returnPct ?? -Infinity) - (a.returnPct ?? -Infinity));
  for (const v of rows) {
    const p = v.position;
    if (!v.filled) {
      out(`  ${p.ticker.padEnd(6)} awaiting fill — verdict ${p.verdictAt.slice(0, 10)}\n`);
      continue;
    }
    const conv = p.conviction != null ? ` ${p.conviction}/10` : '';
    out(
      `  ${p.ticker.padEnd(6)} ${pct(v.returnPct).padStart(8)}  ` +
        `${usd(p.entryPrice)} ${p.entryDate} → ${usd(v.markPrice)} ${v.markDate ?? ''}  ` +
        `${money(v.pnl).padStart(8)}  vs bmk ${pct(v.alphaPct).padStart(8)}  ` +
        `${v.holdingDays ?? '?'}d${conv}${p.status === 'closed' ? ' [closed]' : ''}\n`,
    );
    if (p.thesis) out(`         ${p.thesis.slice(0, 110)}${p.thesis.length > 110 ? '…' : ''}\n`);
  }
}

async function main(): Promise<void> {
  if (!isTursoConfigured()) {
    err('Turso not configured — set TURSO_DATABASE_URL / TURSO_AUTH_TOKEN.\n');
    process.exit(1);
  }
  const cmd = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'run';

  if (cmd === 'close') {
    const selector = process.argv[3];
    if (!selector || selector.startsWith('--')) {
      err('usage: pnpm paper close <TICKER|accession|position-id> [--reason="…"] [--leg=primary|alt]\n');
      process.exit(1);
    }
    const legArg = arg('leg');
    const closed = await closePaperPositions(selector, {
      reason: arg('reason') === 'true' ? undefined : arg('reason'),
      leg: legArg === 'primary' || legArg === 'alt' ? legArg : undefined,
    });
    out(closed.length ? `closed ${closed.length}: ${closed.join(', ')}\n` : 'no open position matched\n');
    return;
  }

  if (cmd !== 'report') {
    // Asking for the book by hand means you want today's number, so this
    // ignores the staleness throttle the sweep runs under.
    const r = await refreshPaperPortfolio({ force: true });
    for (const o of r.opened) {
      err(`opened ${o.ticker} (${o.leg}${o.model ? `, ${o.model}` : ''}) on the ${o.verdictAt.slice(0, 10)} verdict\n`);
    }
    for (const f of r.filled) err(`filled ${f.ticker} at $${f.entryPrice.toFixed(2)} on ${f.entryDate}\n`);
    if (r.marked.length) err(`marked ${r.marked.length} ticker(s)\n`);
    if (r.unpriced.length) {
      err(`⚠ no price data for ${r.unpriced.join(', ')} — delisted, renamed, or a bad symbol\n`);
    }
    if (cmd === 'sync') return;
  }

  const positions = await listPaperPositions();
  if (!positions.length) {
    // A refresh ran just above (unless this was `report`), and it backfills
    // every past verdict — so an empty book here means there is genuinely
    // nothing to buy yet, not that the book is behind.
    out(
      'No mock positions.\n\n' +
        (cmd === 'report'
          ? 'This printed from stored rows without refreshing. Run `pnpm paper` to open and\nprice every past mispriced-long verdict.\n'
          : 'No deep-dive has returned mispriced-long yet — every past verdict was checked, and\n' +
            'there was nothing to buy. The first long that lands opens a position ' +
            `(${money(paperNotional())} equal\nweight, benchmarked to ${paperBenchmark()}).\n`),
    );
    return;
  }
  const benchmark = paperBenchmark();
  const marks = await listPaperMarks([...new Set([...positions.map((p) => p.ticker), benchmark])]);

  const legArg = (arg('leg') ?? 'primary').toLowerCase();
  const legs: PaperLeg[] =
    legArg === 'all' ? ['primary', 'alt'] : legArg === 'alt' ? ['alt'] : ['primary'];
  for (const leg of legs) {
    const subset = positions.filter((p) => p.leg === leg);
    if (!subset.length && leg === 'alt') continue;
    const { valuations, summary } = buildPortfolio(subset, marks, benchmark);
    const models = [...new Set(subset.map((p) => p.model).filter(Boolean))].join(', ');
    printSummary(
      leg === 'primary' ? `Paper portfolio — primary${models ? ` (${models})` : ''}` : `Challenger leg${models ? ` (${models})` : ''}`,
      summary,
    );
    printPositions(valuations);
  }
}

main().catch((e) => {
  err(`${(e as Error).stack ?? e}\n`);
  process.exit(1);
});
