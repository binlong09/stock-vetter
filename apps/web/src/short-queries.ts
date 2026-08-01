import 'server-only';
import { db } from './db';

// One short-side radar signal, as stored by the daily sweep (`pnpm radar`).
export interface RadarRow {
  key: string;
  ticker: string;
  cik: string;
  accession: string;
  form: string;
  filingDate: string;
  kind: string;
  severity: string;
  headline: string;
  detail: string;
  firstSeenAt: string;
}

/**
 * The radar feed, newest surfacing first. Read-only; the CLI sweep writes the
 * `short_radar` table. Returns [] gracefully if the sweep has never run (the
 * table won't exist yet on a fresh database).
 */
export async function listRadarSignals(limit = 200): Promise<RadarRow[]> {
  try {
    const res = await db().execute({
      sql: `SELECT key, ticker, cik, accession, form, filing_date, kind, severity, headline, detail, first_seen_at
            FROM short_radar
            ORDER BY first_seen_at DESC, ticker
            LIMIT ?`,
      args: [limit],
    });
    return res.rows.map((r) => ({
      key: String(r.key),
      ticker: String(r.ticker),
      cik: String(r.cik),
      accession: String(r.accession),
      form: String(r.form),
      filingDate: String(r.filing_date),
      kind: String(r.kind),
      severity: String(r.severity),
      headline: String(r.headline),
      detail: r.detail == null ? '' : String(r.detail),
      firstSeenAt: String(r.first_seen_at),
    }));
  } catch {
    return [];
  }
}

/** EDGAR filing-index URL for a signal's source filing. */
export function edgarFilingUrl(cik: string, accession: string): string {
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replace(/-/g, '')}`;
}
