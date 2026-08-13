import 'server-only';
import type { PaperPosition, PriceSeries } from '@stock-vetter/schema';
import { db } from './db';

/**
 * Read side of the mock-buy book. The sweep (`pnpm radar`) and `pnpm paper`
 * write it; this only reads, like the rest of the viewer.
 *
 * Every query degrades to empty rather than throwing: on a database where the
 * paper migration hasn't run yet (the sweep applies it on its next run), the
 * page should say "nothing here yet", not 500.
 */

export async function listPaperPositions(): Promise<PaperPosition[]> {
  try {
    const res = await db().execute(`SELECT * FROM paper_positions ORDER BY verdict_at DESC, ticker`);
    return res.rows.map((r) => ({
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
    }));
  } catch {
    return [];
  }
}

/** Daily bars for the given tickers, keyed by ticker, oldest first. */
export async function listPaperMarks(tickers: string[]): Promise<Map<string, PriceSeries>> {
  const out = new Map<string, PriceSeries>();
  if (!tickers.length) return out;
  try {
    const res = await db().execute({
      sql: `SELECT ticker, as_of, close, adj_close FROM paper_marks
             WHERE ticker IN (${tickers.map(() => '?').join(',')})
             ORDER BY ticker, as_of`,
      args: tickers,
    });
    for (const r of res.rows) {
      const t = String(r.ticker);
      const mark = {
        ticker: t,
        asOf: String(r.as_of),
        close: Number(r.close),
        adjClose: Number(r.adj_close),
      };
      const series = out.get(t);
      if (series) series.push(mark);
      else out.set(t, [mark]);
    }
  } catch {
    return out;
  }
  return out;
}

/**
 * Past `mispriced-long` verdicts with no position yet — what a backfill would
 * open. The empty state needs this to tell two very different situations
 * apart: "no deep-dive has ever called a long" (nothing to do but wait) and
 * "seven of them have, and the book just hasn't been refreshed" (one command).
 */
export async function countBackfillableVerdicts(): Promise<number> {
  try {
    const res = await db().execute(
      `SELECT COUNT(*) AS n FROM radar_jobs j
        WHERE j.verdict = 'mispriced-long'
          AND NOT EXISTS (SELECT 1 FROM paper_positions p WHERE p.id = j.accession || ':primary')`,
    );
    return Number(res.rows[0]?.n ?? 0);
  } catch {
    return 0;
  }
}

/** Company names for the held tickers, so a row isn't just a symbol. */
export async function companyNamesByTicker(tickers: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!tickers.length) return out;
  try {
    const res = await db().execute({
      sql: `SELECT ticker, name FROM radar_companies WHERE ticker IN (${tickers.map(() => '?').join(',')})`,
      args: tickers,
    });
    for (const r of res.rows) out.set(String(r.ticker), String(r.name));
  } catch {
    return out;
  }
  return out;
}
