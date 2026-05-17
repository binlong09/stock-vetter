/**
 * SQL for the read-only viewer. Light queries (dashboard list) return plain
 * row shapes; queries that need the full structured artifacts parse the
 * `*_json` columns through the @stock-vetter/schema Zod types so the rest of
 * the app works with validated objects, not `any`.
 */
import 'server-only';
import {
  MetaCard,
  FinancialSnapshot,
  ReverseDcfReport,
  DecisionCard,
  type MetaCard as MetaCardT,
  type FinancialSnapshot as FinancialSnapshotT,
  type ReverseDcfReport as ReverseDcfReportT,
  type DecisionCard as DecisionCardT,
} from '@stock-vetter/schema';
import { ChecklistBundle, type ChecklistBundle as ChecklistBundleT } from './lib/checklist';
import { db } from './db';

// ---- dashboard ----------------------------------------------------------

export interface TickerListRow {
  ticker: string;
  verdict: string;
  weightedScore: number;
  summary: string;
  analystVideoCount: number;
  generatedAt: string;
  /** From the meta-card inputs — used to flag a reverse-DCF vs actual gap. */
  reverseDcfCentralImpliedCagr: number | null;
  actualFcf5yCagr: number | null;
  /** Price at analysis time (from financials.snapshot_json.price). */
  analysisPrice: number | null;
  /** Latest EOD price from the cron-refreshed quotes table; null if not fetched yet. */
  currentPrice: number | null;
  /** ISO date for the EOD price's trading session. */
  currentPriceAsOf: string | null;
}

/** All analyzed tickers, highest score first. */
export async function listTickers(): Promise<TickerListRow[]> {
  const res = await db().execute(
    `SELECT t.ticker, t.verdict, t.weighted_score, t.summary, t.analyst_video_count, t.generated_at, t.meta_card_json,
            json_extract(f.snapshot_json, '$.price') AS analysis_price,
            q.price AS current_price, q.as_of AS current_price_as_of
       FROM tickers t
       LEFT JOIN financials f ON f.ticker = t.ticker
       LEFT JOIN quotes q ON q.ticker = t.ticker
      ORDER BY t.weighted_score DESC, t.ticker ASC`,
  );
  return res.rows.map((r) => {
    let implied: number | null = null;
    let actual: number | null = null;
    try {
      const mc = JSON.parse(String(r.meta_card_json)) as {
        inputs?: { reverseDcfCentralImpliedCagr?: number | null; actualFcf5yCagr?: number | null };
      };
      implied = mc.inputs?.reverseDcfCentralImpliedCagr ?? null;
      actual = mc.inputs?.actualFcf5yCagr ?? null;
    } catch {
      // leave nulls — the badge just won't render for this row
    }
    return {
      ticker: String(r.ticker),
      verdict: String(r.verdict),
      weightedScore: Number(r.weighted_score),
      summary: String(r.summary),
      analystVideoCount: Number(r.analyst_video_count),
      generatedAt: String(r.generated_at),
      reverseDcfCentralImpliedCagr: implied,
      actualFcf5yCagr: actual,
      analysisPrice: r.analysis_price == null ? null : Number(r.analysis_price),
      currentPrice: r.current_price == null ? null : Number(r.current_price),
      currentPriceAsOf: r.current_price_as_of == null ? null : String(r.current_price_as_of),
    };
  });
}

// ---- per-ticker ---------------------------------------------------------

export interface TickerDetail {
  ticker: string;
  metaCard: MetaCardT;
  financialSnapshot: FinancialSnapshotT | null;
  reverseDcf: ReverseDcfReportT | null;
  /** Full primary-source-checklist.json — opaque here; parsed by the deep view. */
  primaryChecklist: unknown;
  generatedAt: string;
  pushedAt: string;
  /** Latest EOD price from `quotes`; null until the cron has run for this ticker. */
  currentPrice: number | null;
  currentPriceAsOf: string | null;
}

/** One ticker's meta-card + financials. Null if the ticker isn't in the DB. */
export async function getTickerDetail(ticker: string): Promise<TickerDetail | null> {
  const upper = ticker.toUpperCase();
  const res = await db().execute({
    sql: `SELECT t.ticker, t.generated_at, t.pushed_at, t.meta_card_json,
                 f.snapshot_json, f.reverse_dcf_json,
                 p.checklist_json,
                 q.price AS current_price, q.as_of AS current_price_as_of
            FROM tickers t
            LEFT JOIN financials f ON f.ticker = t.ticker
            LEFT JOIN primary_source_runs p ON p.ticker = t.ticker
            LEFT JOIN quotes q ON q.ticker = t.ticker
           WHERE t.ticker = ?`,
    args: [upper],
  });
  const row = res.rows[0];
  if (!row) return null;
  return {
    ticker: String(row.ticker),
    metaCard: MetaCard.parse(JSON.parse(String(row.meta_card_json))),
    financialSnapshot:
      row.snapshot_json == null ? null : FinancialSnapshot.parse(JSON.parse(String(row.snapshot_json))),
    reverseDcf:
      row.reverse_dcf_json == null
        ? null
        : ReverseDcfReport.parse(JSON.parse(String(row.reverse_dcf_json))),
    primaryChecklist: row.checklist_json == null ? null : JSON.parse(String(row.checklist_json)),
    generatedAt: String(row.generated_at),
    pushedAt: String(row.pushed_at),
    currentPrice: row.current_price == null ? null : Number(row.current_price),
    currentPriceAsOf: row.current_price_as_of == null ? null : String(row.current_price_as_of),
  };
}

/**
 * The full 3-pass primary-source checklist for a ticker (pass1 + pass2 + pass3
 * + citation-verification reports), parsed. Null if the ticker has no run.
 */
export async function getChecklistBundle(ticker: string): Promise<ChecklistBundleT | null> {
  const res = await db().execute({
    sql: `SELECT checklist_json FROM primary_source_runs WHERE ticker = ?`,
    args: [ticker.toUpperCase()],
  });
  const row = res.rows[0];
  if (!row || row.checklist_json == null) return null;
  return ChecklistBundle.parse(JSON.parse(String(row.checklist_json)));
}

export interface AnalystCardSummaryRow {
  ticker: string;
  videoId: string;
  channelId: string | null;
  channel: string | null;
  title: string | null;
  publishedAt: string | null;
  weightedScore: number | null;
  verdict: string | null;
  generatedAt: string;
}

/** Lightweight list of a ticker's analyst-video cards (no card_json). */
export async function listAnalystCards(ticker: string): Promise<AnalystCardSummaryRow[]> {
  const res = await db().execute({
    sql: `SELECT ac.ticker, ac.video_id, ac.channel_id, ac.generated_at, ac.weighted_score, ac.verdict,
                 v.channel, v.title, v.published_at
            FROM analyst_cards ac
            LEFT JOIN videos v ON v.video_id = ac.video_id
           WHERE ac.ticker = ?
           ORDER BY ac.generated_at DESC`,
    args: [ticker.toUpperCase()],
  });
  return res.rows.map((r) => ({
    ticker: String(r.ticker),
    videoId: String(r.video_id),
    channelId: r.channel_id == null ? null : String(r.channel_id),
    channel: r.channel == null ? null : String(r.channel),
    title: r.title == null ? null : String(r.title),
    publishedAt: r.published_at == null ? null : String(r.published_at),
    weightedScore: r.weighted_score == null ? null : Number(r.weighted_score),
    verdict: r.verdict == null ? null : String(r.verdict),
    generatedAt: String(r.generated_at),
  }));
}

/** Full DecisionCard for one analyst video. Null if not found. */
export async function getAnalystCard(
  ticker: string,
  videoId: string,
): Promise<DecisionCardT | null> {
  const res = await db().execute({
    sql: `SELECT card_json FROM analyst_cards WHERE ticker = ? AND video_id = ?`,
    args: [ticker.toUpperCase(), videoId],
  });
  const row = res.rows[0];
  if (!row) return null;
  return DecisionCard.parse(JSON.parse(String(row.card_json)));
}
