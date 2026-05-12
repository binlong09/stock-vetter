/**
 * SQL for the read-only viewer. Each query returns plain rows; callers that need
 * the full structured artifacts parse the `*_json` columns through the
 * @stock-vetter/schema Zod types (added as the routes are built out).
 */
import 'server-only';
import { db } from './db';

export interface TickerListRow {
  ticker: string;
  verdict: string;
  weightedScore: number;
  summary: string;
  analystVideoCount: number;
  generatedAt: string;
}

/** All analyzed tickers, highest score first. */
export async function listTickers(): Promise<TickerListRow[]> {
  const res = await db().execute(
    `SELECT ticker, verdict, weighted_score, summary, analyst_video_count, generated_at
       FROM tickers
      ORDER BY weighted_score DESC, ticker ASC`,
  );
  return res.rows.map((r) => ({
    ticker: String(r.ticker),
    verdict: String(r.verdict),
    weightedScore: Number(r.weighted_score),
    summary: String(r.summary),
    analystVideoCount: Number(r.analyst_video_count),
    generatedAt: String(r.generated_at),
  }));
}
