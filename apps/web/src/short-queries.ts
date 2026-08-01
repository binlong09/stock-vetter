import 'server-only';
import type { ShortAssessment } from '@stock-vetter/schema';
import { db } from './db';

// One short-side radar signal, with the status of its filing's deep-dive job.
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
  // The deep-dive job for this filing (jobs are keyed per accession, so several
  // signals on one filing share it). null when nothing has been queued yet.
  jobStatus: string | null; // pending | running | done | failed
  verdict: string | null;
  conviction: number | null;
}

/**
 * The radar feed, newest surfacing first, each joined to its filing's deep-dive
 * job status. Read-only; the sweep + worker write. Returns [] gracefully if the
 * sweep has never run (the table won't exist yet on a fresh database).
 */
export async function listRadarSignals(limit = 200): Promise<RadarRow[]> {
  try {
    const res = await db().execute({
      sql: `SELECT sr.key, sr.ticker, sr.cik, sr.accession, sr.form, sr.filing_date,
                   sr.kind, sr.severity, sr.headline, sr.detail, sr.first_seen_at,
                   j.status AS job_status, j.verdict, j.conviction
            FROM short_radar sr
            LEFT JOIN radar_jobs j ON j.accession = sr.accession
            ORDER BY sr.first_seen_at DESC, sr.ticker
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
      jobStatus: r.job_status == null ? null : String(r.job_status),
      verdict: r.verdict == null ? null : String(r.verdict),
      conviction: r.conviction == null ? null : Number(r.conviction),
    }));
  } catch {
    return [];
  }
}

export interface RadarAssessment {
  ticker: string;
  cik: string;
  form: string;
  filingDate: string;
  status: string;
  triageScore: number | null;
  escalated: boolean;
  verdict: string | null;
  conviction: number | null;
  error: string | null;
  assessment: ShortAssessment | null; // parsed; null when the job didn't escalate
}

/** The deep-dive result for one filing (accession), for the detail page. */
export async function getRadarAssessment(accession: string): Promise<RadarAssessment | null> {
  try {
    const res = await db().execute({
      sql: `SELECT j.ticker, j.form, j.filing_date, j.status, j.triage_score, j.escalated,
                   j.verdict, j.conviction, j.assessment_json, j.error,
                   (SELECT cik FROM short_radar WHERE accession = j.accession LIMIT 1) AS cik
            FROM radar_jobs j WHERE j.accession = ? LIMIT 1`,
      args: [accession],
    });
    const r = res.rows[0];
    if (!r) return null;
    let assessment: ShortAssessment | null = null;
    if (r.assessment_json != null) {
      try {
        assessment = JSON.parse(String(r.assessment_json)) as ShortAssessment;
      } catch {
        assessment = null;
      }
    }
    return {
      ticker: String(r.ticker),
      cik: r.cik == null ? '0' : String(r.cik),
      form: String(r.form),
      filingDate: String(r.filing_date),
      status: String(r.status),
      triageScore: r.triage_score == null ? null : Number(r.triage_score),
      escalated: Boolean(r.escalated),
      verdict: r.verdict == null ? null : String(r.verdict),
      conviction: r.conviction == null ? null : Number(r.conviction),
      error: r.error == null ? null : String(r.error),
      assessment,
    };
  } catch {
    return null;
  }
}

/** EDGAR filing-index URL for a signal's source filing. */
export function edgarFilingUrl(cik: string, accession: string): string {
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replace(/-/g, '')}`;
}
