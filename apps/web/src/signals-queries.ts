/**
 * Read-only SQL for the Signal Tracker web view. Reads everything the daily
 * cron wrote to Turso: the theses reference data (claim, watch-items), the
 * current thesis_status (green/amber/red), the individual signals, and the
 * per-ticker reverse-DCF from the financials table. The page reflects whatever
 * the last cron run persisted — never local fixtures.
 */
import 'server-only';
import {
  Thesis,
  ThesisStatus,
  Signal,
  ReverseDcfReport,
  EvaluationRecord,
  type Thesis as ThesisT,
  type ThesisStatus as ThesisStatusT,
  type Signal as SignalT,
  type ReverseDcfReport as ReverseDcfReportT,
  type EvaluationRecord as EvaluationRecordT,
} from '@stock-vetter/schema';
import { db } from './db';

export interface ThesisListRow {
  thesisId: string;
  claim: string;
  tickers: string[];
  health: string; // 'green' | 'amber' | 'red'; 'green' default if no status row
  trippedWatchItemIds: string[];
  updatedAt: string | null;
}

/** All theses with their current status, tripped (red) first. */
export async function listTheses(): Promise<ThesisListRow[]> {
  const res = await db().execute(
    `SELECT t.thesis_id, t.claim, t.tickers,
            s.health, s.tripped, s.updated_at
       FROM theses t
       LEFT JOIN thesis_status s ON s.thesis_id = t.thesis_id
      ORDER BY t.thesis_id ASC`,
  );
  return res.rows.map((r) => ({
    thesisId: String(r.thesis_id),
    claim: String(r.claim),
    tickers: JSON.parse(String(r.tickers)) as string[],
    health: r.health == null ? 'green' : String(r.health),
    trippedWatchItemIds: r.tripped == null ? [] : (JSON.parse(String(r.tripped)) as string[]),
    updatedAt: r.updated_at == null ? null : String(r.updated_at),
  }));
}

export interface ThesisDetail {
  thesis: ThesisT;
  status: ThesisStatusT | null;
  signalsByWatchItem: Map<string, SignalT[]>;
  reverseDcfByTicker: Map<string, ReverseDcfReportT>;
}

/** One thesis: definition + status + signals (grouped by watch-item) + DCFs. */
export async function getThesisDetail(thesisId: string): Promise<ThesisDetail | null> {
  const client = db();

  const tRes = await client.execute({
    sql: `SELECT thesis_id, claim, tickers, entities, watch_items FROM theses WHERE thesis_id = ?`,
    args: [thesisId],
  });
  const tRow = tRes.rows[0];
  if (!tRow) return null;
  const thesis = Thesis.parse({
    id: String(tRow.thesis_id),
    claim: String(tRow.claim),
    tickers: JSON.parse(String(tRow.tickers)),
    entities: JSON.parse(String(tRow.entities)),
    watchItems: JSON.parse(String(tRow.watch_items)),
  });

  const sRes = await client.execute({
    sql: `SELECT health, watch_items, tripped, updated_at FROM thesis_status WHERE thesis_id = ?`,
    args: [thesisId],
  });
  const sRow = sRes.rows[0];
  const status: ThesisStatusT | null = sRow
    ? ThesisStatus.parse({
        thesisId,
        health: String(sRow.health),
        watchItems: JSON.parse(String(sRow.watch_items)),
        trippedWatchItemIds: JSON.parse(String(sRow.tripped)),
        updatedAt: String(sRow.updated_at),
      })
    : null;

  const sigRes = await client.execute({
    sql: `SELECT thesis_id, watch_item_id, event_dedup_key, direction, magnitude,
                 confidence, rationale, citation, data_quality
            FROM signals WHERE thesis_id = ? ORDER BY magnitude DESC`,
    args: [thesisId],
  });
  const signalsByWatchItem = new Map<string, SignalT[]>();
  for (const r of sigRes.rows) {
    const sig = Signal.parse({
      thesisId: String(r.thesis_id),
      watchItemId: String(r.watch_item_id),
      eventDedupKey: String(r.event_dedup_key),
      direction: String(r.direction),
      magnitude: Number(r.magnitude),
      confidence: String(r.confidence),
      rationale: String(r.rationale),
      citation: String(r.citation),
      dataQuality: String(r.data_quality),
    });
    const arr = signalsByWatchItem.get(sig.watchItemId) ?? [];
    arr.push(sig);
    signalsByWatchItem.set(sig.watchItemId, arr);
  }

  // Reverse-DCF per ticker (from the analysis pipeline's financials table, if
  // that ticker has been analyzed). Best-effort — a thesis ticker with no
  // analysis simply has no DCF.
  const reverseDcfByTicker = new Map<string, ReverseDcfReportT>();
  for (const ticker of thesis.tickers) {
    const fRes = await client.execute({
      sql: `SELECT reverse_dcf_json FROM financials WHERE ticker = ?`,
      args: [ticker.toUpperCase()],
    });
    const raw = fRes.rows[0]?.reverse_dcf_json;
    if (raw == null) continue;
    const parsed = ReverseDcfReport.safeParse(JSON.parse(String(raw)));
    if (parsed.success) reverseDcfByTicker.set(ticker.toUpperCase(), parsed.data);
  }

  return { thesis, status, signalsByWatchItem, reverseDcfByTicker };
}

/**
 * Recent eval-log rows for a thesis — what the runs actually evaluated,
 * including the no_candidate / neutral cases that never became signals.
 * Newest event first. Read-only.
 */
export async function getThesisEvaluations(
  thesisId: string,
  limit = 50,
): Promise<EvaluationRecordT[]> {
  const res = await db().execute({
    sql: `SELECT thesis_id, watch_item_id, event_dedup_key, ticker, source,
                 event_date, outcome, has_signal, evaluated_at
            FROM evaluations WHERE thesis_id = ?
            ORDER BY event_date DESC, evaluated_at DESC
            LIMIT ?`,
    args: [thesisId, limit],
  });
  return res.rows.map((r) =>
    EvaluationRecord.parse({
      thesisId: String(r.thesis_id),
      watchItemId: String(r.watch_item_id),
      eventDedupKey: String(r.event_dedup_key),
      ticker: String(r.ticker),
      source: String(r.source),
      eventDate: String(r.event_date),
      outcome: String(r.outcome),
      hasSignal: Number(r.has_signal) === 1,
      evaluatedAt: String(r.evaluated_at),
    }),
  );
}
