/**
 * Paper ("mock buy") portfolio — persistence and refresh.
 *
 * The rule the whole module implements: every deep-dive verdict of
 * `mispriced-long` becomes a fixed-size long position, filled at the first
 * daily close at or after the verdict, held until something closes it. There
 * is no discretion anywhere in the path — positions are DERIVED from
 * `radar_jobs`, not entered by hand — because a track record built from picks
 * someone chose to act on measures the person, not the pipeline.
 *
 * Everything is idempotent and self-healing, in the same spirit as
 * `enqueueMissingRadarJobs`: `refreshPaperPortfolio()` opens whatever is
 * missing (including backfilling verdicts that predate this feature), re-fetches
 * the price history for every held name, and fills any entry that was waiting
 * on a close. Running it twice costs two fetches and changes nothing else.
 *
 * The pure valuation math lives in @stock-vetter/schema so the CLI report and
 * the web viewer compute the portfolio the same way.
 */

import type { PaperLeg, PaperPosition, PaperMark, PriceSeries } from '@stock-vetter/schema';
import { fetchDailyBars, getTursoClient, isTursoConfigured, migrate } from '@stock-vetter/core';

/** The verdict that triggers a mock buy. The one input to the whole feature. */
const BUY_VERDICT = 'mispriced-long';

/** Dollars per position. Equal weight: the record then measures hit rate, not sizing. */
export function paperNotional(): number {
  const n = Number(process.env.PAPER_NOTIONAL ?? 10_000);
  return Number.isFinite(n) && n > 0 ? n : 10_000;
}

/**
 * What the portfolio is measured against. IWM (Russell 2000) rather than SPY:
 * the universe is small-cap tech, and "we're up 9%" means nothing without
 * knowing whether small caps were up 12% over the same weeks.
 */
export function paperBenchmark(): string {
  return (process.env.PAPER_BENCHMARK ?? 'IWM').toUpperCase();
}

/** Whether the challenger leg's picks get their own shadow positions. */
function trackAltLeg(): boolean {
  return process.env.PAPER_TRACK_ALT !== '0';
}

function thesisOf(assessmentJson: unknown): string | null {
  if (assessmentJson == null) return null;
  try {
    const a = JSON.parse(String(assessmentJson)) as { thesis?: unknown };
    return typeof a.thesis === 'string' ? a.thesis : null;
  } catch {
    return null;
  }
}

// ---- opening ---------------------------------------------------------------

export interface OpenedPaperPosition {
  id: string;
  ticker: string;
  leg: PaperLeg;
  model: string | null;
  conviction: number | null;
  verdictAt: string;
}

/**
 * Open a position for every `mispriced-long` deep-dive that doesn't have one.
 *
 * Backfills as a matter of course: a verdict from three months ago gets a
 * position dated to that verdict, and the fill/return then come from the
 * historical bars, so switching this feature on doesn't reset the track record
 * to zero. `verdict_at` is the job's `finished_at` (falling back to
 * `enqueued_at` on rows that predate it) — the moment the buy was decided.
 *
 * Both synthesis legs are opened when the challenger also said mispriced-long;
 * disable with PAPER_TRACK_ALT=0.
 */
export async function openMissingPaperPositions(): Promise<OpenedPaperPosition[]> {
  if (!isTursoConfigured()) return [];
  await migrate();
  const client = getTursoClient();
  if (!client) return [];

  const legs: PaperLeg[] = trackAltLeg() ? ['primary', 'alt'] : ['primary'];
  const now = new Date().toISOString();
  const notional = paperNotional();
  const benchmark = paperBenchmark();
  const opened: OpenedPaperPosition[] = [];

  for (const leg of legs) {
    const verdictCol = leg === 'primary' ? 'verdict' : 'alt_verdict';
    const convictionCol = leg === 'primary' ? 'conviction' : 'alt_conviction';
    const modelCol = leg === 'primary' ? 'model' : 'alt_model';
    const assessmentCol = leg === 'primary' ? 'assessment_json' : 'alt_assessment_json';
    const res = await client.execute({
      sql: `SELECT j.accession, j.ticker, j.form, j.filing_date,
                   j.${convictionCol} AS conviction, j.${modelCol} AS model,
                   j.${assessmentCol} AS assessment_json,
                   COALESCE(j.finished_at, j.enqueued_at) AS verdict_at
              FROM radar_jobs j
              LEFT JOIN paper_positions p ON p.id = j.accession || ':' || ?
             WHERE j.${verdictCol} = ? AND p.id IS NULL
             ORDER BY verdict_at`,
      args: [leg, BUY_VERDICT],
    });
    for (const r of res.rows) {
      const id = `${String(r.accession)}:${leg}`;
      const verdictAt = String(r.verdict_at);
      const ins = await client.execute({
        sql: `INSERT OR IGNORE INTO paper_positions
                (id, accession, ticker, leg, model, form, filing_date, conviction, thesis,
                 verdict_at, opened_at, notional, benchmark, status)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
        args: [
          id,
          String(r.accession),
          String(r.ticker).toUpperCase(),
          leg,
          r.model == null ? null : String(r.model),
          r.form == null ? '' : String(r.form),
          r.filing_date == null ? '' : String(r.filing_date),
          r.conviction == null ? null : Number(r.conviction),
          thesisOf(r.assessment_json),
          verdictAt,
          now,
          notional,
          benchmark,
        ],
      });
      if (ins.rowsAffected > 0) {
        opened.push({
          id,
          ticker: String(r.ticker).toUpperCase(),
          leg,
          model: r.model == null ? null : String(r.model),
          conviction: r.conviction == null ? null : Number(r.conviction),
          verdictAt,
        });
      }
    }
  }
  return opened;
}

// ---- marks -----------------------------------------------------------------

function rowToPosition(r: Record<string, unknown>): PaperPosition {
  return {
    id: String(r.id),
    accession: String(r.accession),
    ticker: String(r.ticker),
    leg: String(r.leg) === 'alt' ? 'alt' : 'primary',
    model: r.model == null ? null : String(r.model),
    form: r.form == null ? '' : String(r.form),
    filingDate: r.filing_date == null ? '' : String(r.filing_date),
    conviction: r.conviction == null ? null : Number(r.conviction),
    thesis: r.thesis == null ? null : String(r.thesis),
    verdictAt: String(r.verdict_at),
    openedAt: String(r.opened_at),
    entryDate: r.entry_date == null ? null : String(r.entry_date),
    entryPrice: r.entry_price == null ? null : Number(r.entry_price),
    notional: Number(r.notional),
    benchmark: r.benchmark == null ? 'IWM' : String(r.benchmark),
    status: String(r.status) === 'closed' ? 'closed' : 'open',
    closedAt: r.closed_at == null ? null : String(r.closed_at),
    exitDate: r.exit_date == null ? null : String(r.exit_date),
    exitPrice: r.exit_price == null ? null : Number(r.exit_price),
    closeReason: r.close_reason == null ? null : String(r.close_reason),
  };
}

/** Every mock position, newest verdict first. */
export async function listPaperPositions(): Promise<PaperPosition[]> {
  if (!isTursoConfigured()) return [];
  await migrate();
  const client = getTursoClient();
  if (!client) return [];
  const res = await client.execute(
    `SELECT * FROM paper_positions ORDER BY verdict_at DESC, ticker`,
  );
  return res.rows.map((r) => rowToPosition(r as unknown as Record<string, unknown>));
}

/** The stored daily bars for these tickers, keyed by ticker, oldest first. */
export async function listPaperMarks(tickers: string[]): Promise<Map<string, PriceSeries>> {
  const out = new Map<string, PriceSeries>();
  if (!tickers.length || !isTursoConfigured()) return out;
  await migrate();
  const client = getTursoClient();
  if (!client) return out;
  for (let i = 0; i < tickers.length; i += 200) {
    const batch = tickers.slice(i, i + 200);
    const res = await client.execute({
      sql: `SELECT ticker, as_of, close, adj_close FROM paper_marks
             WHERE ticker IN (${batch.map(() => '?').join(',')})
             ORDER BY ticker, as_of`,
      args: batch,
    });
    for (const r of res.rows) {
      const t = String(r.ticker);
      const mark: PaperMark = {
        ticker: t,
        asOf: String(r.as_of),
        close: Number(r.close),
        adjClose: Number(r.adj_close),
      };
      const series = out.get(t);
      if (series) series.push(mark);
      else out.set(t, [mark]);
    }
  }
  return out;
}

async function storeMarks(ticker: string, bars: { asOf: string; close: number; adjClose: number }[]): Promise<void> {
  const client = getTursoClient();
  if (!client || !bars.length) return;
  const now = new Date().toISOString();
  // REPLACE, not IGNORE: Yahoo re-adjusts historical adjusted closes after a
  // split or dividend, and a stale adjustment basis is exactly the bug that
  // makes a reverse-split microcap look like a ten-bagger.
  for (let i = 0; i < bars.length; i += 200) {
    await client.batch(
      bars.slice(i, i + 200).map((b) => ({
        sql: `INSERT INTO paper_marks (ticker, as_of, close, adj_close, fetched_at)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(ticker, as_of) DO UPDATE SET
                close = excluded.close,
                adj_close = excluded.adj_close,
                fetched_at = excluded.fetched_at`,
        args: [ticker, b.asOf, b.close, b.adjClose, now],
      })),
      'write',
    );
  }
}

export interface PaperRefreshResult {
  opened: OpenedPaperPosition[];
  /** Positions that got their entry fill on this run. */
  filled: { id: string; ticker: string; entryDate: string; entryPrice: number }[];
  /** Tickers whose bars were refreshed. */
  marked: string[];
  /** Tickers skipped because their marks are still fresh. */
  skipped: string[];
  /** Tickers Yahoo returned nothing for — delisted, renamed, or never listed. */
  unpriced: string[];
}

/**
 * How old a ticker's marks may be before a refresh re-fetches them. The sweep
 * calls this five times through the session and the book only grows, so
 * without a floor the portfolio would eventually cost hundreds of Yahoo
 * requests a day to keep a paper P&L four hours fresher than it needs to be.
 * A ticker with no marks at all (a position opened this run) is never skipped.
 */
function markMaxAgeMs(): number {
  const h = Number(process.env.PAPER_MARK_MIN_HOURS ?? 4);
  return (Number.isFinite(h) && h >= 0 ? h : 4) * 3_600_000;
}

/** Last time each ticker's bars were fetched. */
async function lastFetchedByTicker(): Promise<Map<string, string>> {
  const client = getTursoClient();
  const out = new Map<string, string>();
  if (!client) return out;
  const res = await client.execute(
    `SELECT ticker, MAX(fetched_at) AS fetched_at FROM paper_marks GROUP BY ticker`,
  );
  for (const r of res.rows) out.set(String(r.ticker), String(r.fetched_at));
  return out;
}

/**
 * Open what's missing, refresh the price history for everything held, and fill
 * any entry that was waiting on a close.
 *
 * One chart request per held ticker (plus the benchmark), fetching the whole
 * window from the earliest verdict. That is deliberately more data than a
 * "today's close" fetch would be: it is what keeps the adjustment basis
 * consistent across a split, and it makes the run stateless — the marks table
 * can be dropped and rebuilt from scratch by running this again.
 *
 * Never throws for a single bad symbol: a delisted ticker is reported in
 * `unpriced` and the rest of the portfolio still updates.
 */
export async function refreshPaperPortfolio(
  opts: { force?: boolean } = {},
): Promise<PaperRefreshResult> {
  const result: PaperRefreshResult = { opened: [], filled: [], marked: [], skipped: [], unpriced: [] };
  if (!isTursoConfigured()) return result;
  await migrate();
  const client = getTursoClient();
  if (!client) return result;

  result.opened = await openMissingPaperPositions();

  const positions = await listPaperPositions();
  const live = positions.filter((p) => p.status === 'open');
  if (!live.length) return result;

  // Earliest bar anyone needs, with a week of slack so the entry lookup has a
  // bar to land on even when the verdict fell on a long weekend.
  const earliest = live.reduce(
    (min, p) => (p.verdictAt.slice(0, 10) < min ? p.verdictAt.slice(0, 10) : min),
    live[0]!.verdictAt.slice(0, 10),
  );
  const since = new Date(Date.parse(`${earliest}T00:00:00Z`) - 7 * 86_400_000);
  const benchmark = paperBenchmark();
  const tickers = [...new Set([...live.map((p) => p.ticker), benchmark])];

  const lastFetched = await lastFetchedByTicker();
  const cutoff = Date.now() - markMaxAgeMs();
  const series = new Map<string, { asOf: string; close: number; adjClose: number }[]>();
  for (const ticker of tickers) {
    const seen = lastFetched.get(ticker);
    if (!opts.force && seen && Date.parse(seen) > cutoff) {
      result.skipped.push(ticker);
      continue;
    }
    try {
      const bars = await fetchDailyBars(ticker, since);
      if (!bars.length) {
        result.unpriced.push(ticker);
        continue;
      }
      await storeMarks(ticker, bars);
      series.set(ticker, bars);
      result.marked.push(ticker);
    } catch {
      result.unpriced.push(ticker);
    }
  }

  // Fill entries: the first close at or after the verdict. A verdict that
  // landed after today's close simply has no such bar yet and stays pending —
  // which is the honest state, not a reason to fill it at a stale price.
  for (const p of live) {
    if (p.entryDate != null) continue;
    const day = p.verdictAt.slice(0, 10);
    let bar = series.get(p.ticker)?.find((b) => b.asOf >= day) ?? null;
    if (!bar && result.skipped.includes(p.ticker)) {
      // Marks were fresh enough to skip re-fetching, but this position still
      // needs its entry bar — read it straight out of what's stored.
      const res = await client.execute({
        sql: `SELECT as_of, close, adj_close FROM paper_marks
               WHERE ticker = ? AND as_of >= ? ORDER BY as_of LIMIT 1`,
        args: [p.ticker, day],
      });
      const row = res.rows[0];
      if (row) bar = { asOf: String(row.as_of), close: Number(row.close), adjClose: Number(row.adj_close) };
    }
    if (!bar) continue;
    await client.execute({
      sql: `UPDATE paper_positions SET entry_date = ?, entry_price = ? WHERE id = ? AND entry_date IS NULL`,
      args: [bar.asOf, bar.close, p.id],
    });
    result.filled.push({ id: p.id, ticker: p.ticker, entryDate: bar.asOf, entryPrice: bar.close });
  }

  return result;
}

// ---- closing ---------------------------------------------------------------

/**
 * Close positions by ticker or by position id, at the last known mark.
 *
 * Manual by design and expected to be rare: the tracked strategy is buy-and-
 * hold, so a close is an operator saying "this thesis is dead" or "the name
 * got taken out" — an event, not a rule. Returns the ids closed.
 */
export async function closePaperPositions(
  selector: string,
  opts: { reason?: string; leg?: PaperLeg } = {},
): Promise<string[]> {
  if (!isTursoConfigured()) return [];
  await migrate();
  const client = getTursoClient();
  if (!client) return [];
  const key = selector.toUpperCase();
  const res = await client.execute({
    sql: `SELECT * FROM paper_positions
           WHERE status = 'open' AND (ticker = ? OR id = ? OR accession = ?)
             AND (? IS NULL OR leg = ?)`,
    args: [key, selector, selector, opts.leg ?? null, opts.leg ?? null],
  });
  const now = new Date().toISOString();
  const closed: string[] = [];
  for (const row of res.rows) {
    const p = rowToPosition(row as unknown as Record<string, unknown>);
    const mark = await client.execute({
      sql: `SELECT as_of, close FROM paper_marks WHERE ticker = ? ORDER BY as_of DESC LIMIT 1`,
      args: [p.ticker],
    });
    const last = mark.rows[0];
    await client.execute({
      sql: `UPDATE paper_positions SET status='closed', closed_at=?, exit_date=?, exit_price=?, close_reason=?
             WHERE id = ? AND status = 'open'`,
      args: [
        now,
        last ? String(last.as_of) : null,
        last ? Number(last.close) : null,
        opts.reason ?? 'closed manually',
        p.id,
      ],
    });
    closed.push(p.id);
  }
  return closed;
}
