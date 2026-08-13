// Paper ("mock buy") portfolio: the pipeline's own track record.
//
// The premise is one rule, applied without discretion: EVERY deep-dive verdict
// of `mispriced-long` is bought, same size, and held. No sizing judgement, no
// skipping the ones that look scary, no selling on a hunch. That is what makes
// the resulting number a measurement of the PIPELINE rather than of the
// operator — if positions were opened selectively, the track record would
// measure the selection, and the question "does the radar find real longs"
// would stay unanswered forever.
//
// Two decisions in here are load-bearing and worth stating up front:
//
//  1. RETURNS ARE COMPUTED FROM ADJUSTED CLOSES, never from the raw entry price
//     against a raw current price. The universe is $50M–$2B tech, where reverse
//     splits are routine; a 1-for-10 reverse split would otherwise print as a
//     +900% winner and quietly poison every aggregate on the page. The adjusted
//     series is re-fetched whole on each refresh, so a split that happens after
//     entry re-adjusts the entry bar too and the ratio stays honest.
//
//  2. THE FILL IS THE FIRST DAILY CLOSE AT OR AFTER THE VERDICT. Not the price
//     at the instant the worker finished (that can be 3am, or mid-session on a
//     name with a 4% spread), and not the pre-filing price (which would be
//     free money). It is the most defensible fill a reader could actually have
//     gotten by acting on the verdict when they saw it, and it is deterministic
//     — the same verdict re-priced next month yields the same entry.
//
// Everything here is pure: rows in, numbers out. The Turso reads/writes live in
// @stock-vetter/pipeline, the CLI report in scripts/paper.ts, the page in
// apps/web — all three share this module so the CLI and the viewer can never
// disagree about what the portfolio is worth.

/**
 * Which synthesis leg produced the verdict. `primary` is the model the radar
 * acts on (Claude by default); `alt` is the side-by-side challenger. Tracking
 * both turns the model comparison from "do they agree" into "whose picks made
 * money", which is the only version of that question that settles.
 */
export type PaperLeg = 'primary' | 'alt';

export type PaperStatus = 'open' | 'closed';

/** One mock buy. Mirrors a `paper_positions` row. */
export interface PaperPosition {
  /** `<accession>:<leg>` — one buy per deep-dive leg, so a re-run can't double up. */
  id: string;
  accession: string;
  ticker: string;
  leg: PaperLeg;
  /** The model that returned the verdict, as recorded on the job. */
  model: string | null;
  form: string;
  filingDate: string;
  conviction: number | null;
  /** The assessment's thesis, denormalized so the portfolio reads standalone. */
  thesis: string | null;
  /** ISO timestamp of the deep-dive verdict — the moment the buy was decided. */
  verdictAt: string;
  /** ISO timestamp the position row was created. */
  openedAt: string;
  /** Trading date of the fill. Null until a close at/after `verdictAt` exists. */
  entryDate: string | null;
  /** Raw (unadjusted) close on `entryDate` — what a share cost that day. */
  entryPrice: number | null;
  /** Dollars committed. Equal-weight across positions by design. */
  notional: number;
  /** Symbol the position is measured against, e.g. IWM. */
  benchmark: string;
  status: PaperStatus;
  closedAt: string | null;
  exitDate: string | null;
  exitPrice: number | null;
  closeReason: string | null;
}

/** One daily bar, as stored in `paper_marks`. */
export interface PaperMark {
  ticker: string;
  /** Trading date, YYYY-MM-DD. */
  asOf: string;
  /** Raw close. */
  close: number;
  /** Split/dividend-adjusted close — what returns are computed from. */
  adjClose: number;
}

/** A ticker's bars, oldest first. */
export type PriceSeries = PaperMark[];

// ---- series lookups --------------------------------------------------------

/** The first bar on or after `date`, or null if the series ends before it. */
export function barOnOrAfter(series: PriceSeries, date: string): PaperMark | null {
  for (const m of series) if (m.asOf >= date) return m;
  return null;
}

/** The last bar on or before `date`, or null if the series starts after it. */
export function barOnOrBefore(series: PriceSeries, date: string): PaperMark | null {
  let out: PaperMark | null = null;
  for (const m of series) {
    if (m.asOf > date) break;
    out = m;
  }
  return out;
}

/** The newest bar in the series. */
export function lastBar(series: PriceSeries): PaperMark | null {
  return series.length ? series[series.length - 1]! : null;
}

// ---- valuation -------------------------------------------------------------

export interface PositionValuation {
  position: PaperPosition;
  /** False until the fill exists — a verdict reached after the close waits a day. */
  filled: boolean;
  /** Trading date of the mark (exit date for a closed position). */
  markDate: string | null;
  /** Raw close on `markDate` — the per-share price to show. */
  markPrice: number | null;
  /** Adjusted-close return since entry. Null while unfilled or unmarked. */
  returnPct: number | null;
  /** Dollars committed, once filled. */
  costBasis: number | null;
  /** costBasis × (1 + returnPct). */
  marketValue: number | null;
  pnl: number | null;
  /** The benchmark's return over the SAME window — the only fair comparison. */
  benchmarkReturnPct: number | null;
  /** returnPct − benchmarkReturnPct. What the pick added over just being long small caps. */
  alphaPct: number | null;
  /** Calendar days from entry to mark. */
  holdingDays: number | null;
}

const DAY_MS = 86_400_000;

function daysBetween(a: string, b: string): number {
  return Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS));
}

/**
 * Value one position against its ticker's series and the benchmark's.
 *
 * A closed position is valued at its exit, so the aggregates below mix realized
 * and unrealized results without a second code path — which is right, because
 * the question ("did the verdict make money") doesn't care whether the trade is
 * still on.
 */
export function valuePosition(
  position: PaperPosition,
  series: PriceSeries,
  benchmarkSeries: PriceSeries,
): PositionValuation {
  const base: PositionValuation = {
    position,
    filled: position.entryDate != null,
    markDate: null,
    markPrice: null,
    returnPct: null,
    costBasis: null,
    marketValue: null,
    pnl: null,
    benchmarkReturnPct: null,
    alphaPct: null,
    holdingDays: null,
  };
  const entryDate = position.entryDate;
  if (entryDate == null) return base;

  const entryBar = barOnOrBefore(series, entryDate);
  // A closed position marks at its exit date and stays there; an open one marks
  // at the newest bar we have.
  const markBar =
    position.status === 'closed' && position.exitDate
      ? barOnOrBefore(series, position.exitDate)
      : lastBar(series);
  const costBasis = position.notional;

  if (!entryBar || !markBar || entryBar.adjClose <= 0) {
    // Filled, but the marks haven't caught up (or the series is unusable —
    // a delisting, a ticker change). Report the cost basis and no return
    // rather than inventing a flat one.
    return { ...base, costBasis };
  }

  const returnPct = markBar.adjClose / entryBar.adjClose - 1;
  const benchEntry = barOnOrBefore(benchmarkSeries, entryBar.asOf);
  const benchMark = barOnOrBefore(benchmarkSeries, markBar.asOf);
  const benchmarkReturnPct =
    benchEntry && benchMark && benchEntry.adjClose > 0
      ? benchMark.adjClose / benchEntry.adjClose - 1
      : null;

  return {
    position,
    filled: true,
    markDate: markBar.asOf,
    markPrice: markBar.close,
    returnPct,
    costBasis,
    marketValue: costBasis * (1 + returnPct),
    pnl: costBasis * returnPct,
    benchmarkReturnPct,
    alphaPct: benchmarkReturnPct == null ? null : returnPct - benchmarkReturnPct,
    holdingDays: daysBetween(entryBar.asOf, markBar.asOf),
  };
}

export interface PortfolioSummary {
  /** Positions with a fill and a mark — the ones every number below is computed from. */
  valued: number;
  /** Opened but not yet priced (verdict landed after the close, or a bad symbol). */
  pending: number;
  open: number;
  closed: number;
  costBasis: number;
  marketValue: number;
  pnl: number;
  /** Portfolio return: pnl / costBasis. Equal-weight, so this is also the mean. */
  returnPct: number | null;
  /** The same dollars, put in the benchmark on each position's entry date. */
  benchmarkValue: number | null;
  benchmarkReturnPct: number | null;
  /** returnPct − benchmarkReturnPct. The number the pipeline lives or dies on. */
  alphaPct: number | null;
  /** Share of valued positions with a positive return. */
  winRate: number | null;
  /** Share of valued positions that beat the benchmark over their own window. */
  beatBenchmarkRate: number | null;
  medianReturnPct: number | null;
  best: PositionValuation | null;
  worst: PositionValuation | null;
  /** Mean calendar days held — how mature the record is, and thus how much to trust it. */
  avgHoldingDays: number | null;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * Roll valuations into the portfolio-level numbers.
 *
 * The benchmark leg is computed position-by-position rather than as one index
 * return over the whole span: each mock buy has its own entry date, so "what
 * the same money in IWM would have done" only means something if each dollar
 * enters the benchmark the day its position did.
 */
export function summarizePortfolio(vals: PositionValuation[]): PortfolioSummary {
  const valued = vals.filter((v) => v.returnPct != null && v.costBasis != null);
  const costBasis = valued.reduce((s, v) => s + v.costBasis!, 0);
  const marketValue = valued.reduce((s, v) => s + v.marketValue!, 0);
  const withBench = valued.filter((v) => v.benchmarkReturnPct != null);
  const benchmarkBasis = withBench.reduce((s, v) => s + v.costBasis!, 0);
  const benchmarkValue = withBench.reduce(
    (s, v) => s + v.costBasis! * (1 + v.benchmarkReturnPct!),
    0,
  );
  const returnPct = costBasis > 0 ? marketValue / costBasis - 1 : null;
  // Compare like with like: the benchmark return is over the subset of
  // positions that HAVE a benchmark, so alpha isn't polluted by positions
  // counted on one side only.
  const benchmarkReturnPct = benchmarkBasis > 0 ? benchmarkValue / benchmarkBasis - 1 : null;
  const ownReturnOverBenchSubset =
    benchmarkBasis > 0
      ? withBench.reduce((s, v) => s + v.marketValue!, 0) / benchmarkBasis - 1
      : null;
  const holdingDays = valued.map((v) => v.holdingDays).filter((d): d is number => d != null);

  const sorted = [...valued].sort((a, b) => b.returnPct! - a.returnPct!);
  return {
    valued: valued.length,
    pending: vals.filter((v) => v.returnPct == null).length,
    open: vals.filter((v) => v.position.status === 'open').length,
    closed: vals.filter((v) => v.position.status === 'closed').length,
    costBasis,
    marketValue,
    pnl: marketValue - costBasis,
    returnPct,
    benchmarkValue: benchmarkBasis > 0 ? benchmarkValue : null,
    benchmarkReturnPct,
    alphaPct:
      ownReturnOverBenchSubset != null && benchmarkReturnPct != null
        ? ownReturnOverBenchSubset - benchmarkReturnPct
        : null,
    winRate: valued.length ? valued.filter((v) => v.returnPct! > 0).length / valued.length : null,
    beatBenchmarkRate: withBench.length
      ? withBench.filter((v) => v.alphaPct! > 0).length / withBench.length
      : null,
    medianReturnPct: median(valued.map((v) => v.returnPct!)),
    best: sorted[0] ?? null,
    worst: sorted.length > 1 ? sorted[sorted.length - 1]! : null,
    avgHoldingDays: holdingDays.length
      ? holdingDays.reduce((s, d) => s + d, 0) / holdingDays.length
      : null,
  };
}

/**
 * Value every position and summarize, given the marks keyed by ticker. The one
 * entry point callers need; `valuePosition`/`summarizePortfolio` are exported
 * for tests and for callers that already hold valuations.
 */
export function buildPortfolio(
  positions: PaperPosition[],
  marks: Map<string, PriceSeries>,
  benchmark: string,
): { valuations: PositionValuation[]; summary: PortfolioSummary } {
  const bench = marks.get(benchmark) ?? [];
  const valuations = positions.map((p) => valuePosition(p, marks.get(p.ticker) ?? [], bench));
  return { valuations, summary: summarizePortfolio(valuations) };
}
