import 'server-only';
import type { MispricingAssessment } from '@stock-vetter/schema';
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
  /** bearish | bullish | ambiguous. Rows written before the reframe are bearish. */
  direction: string;
  headline: string;
  detail: string;
  /** Market cap at the last universe rebuild; null for the legacy watchlist. */
  marketCap: number | null;
  /** On the focus list at the time the signal was surfaced. */
  focus: boolean;
  firstSeenAt: string;
  // The deep-dive job for this filing (jobs are keyed per accession, so several
  // signals on one filing share it). null when nothing has been queued yet.
  jobStatus: string | null; // pending | running | done | failed
  verdict: string | null;
  conviction: number | null;
  /** The comparison model's verdict, when a side-by-side ran. */
  altVerdict: string | null;
  /** Full company name, when the sweep has stored one for this CIK. */
  companyName: string | null;
  /** Short business description (or SIC industry label as fallback). */
  companyDescription: string | null;
}

// Company identity rows, keyed by CIK. Queried separately from the feed —
// never joined — so a database the sweep hasn't migrated yet (no
// radar_companies table) costs the names, not the feed.
async function companyByCik(): Promise<Map<string, { name: string; description: string | null }>> {
  try {
    const res = await db().execute(`SELECT cik, name, description FROM radar_companies`);
    return new Map(
      res.rows.map((r) => [
        String(r.cik),
        { name: String(r.name), description: r.description == null ? null : String(r.description) },
      ]),
    );
  } catch {
    return new Map();
  }
}

/**
 * The radar feed, newest surfacing first, each joined to its filing's deep-dive
 * job status. Read-only; the sweep + worker write. Returns [] gracefully if the
 * sweep has never run (the table won't exist yet on a fresh database).
 */
export async function listRadarSignals(limit = 200): Promise<RadarRow[]> {
  try {
    const companies = await companyByCik();
    const res = await db().execute({
      sql: `SELECT sr.key, sr.ticker, sr.cik, sr.accession, sr.form, sr.filing_date,
                   sr.kind, sr.severity, sr.direction, sr.headline, sr.detail,
                   sr.market_cap, sr.focus, sr.first_seen_at,
                   j.status AS job_status, j.verdict, j.conviction, j.alt_verdict
            FROM short_radar sr
            LEFT JOIN radar_jobs j ON j.accession = sr.accession
            ORDER BY sr.first_seen_at DESC, sr.ticker
            LIMIT ?`,
      args: [limit],
    });
    return res.rows.map((r) => ({
      companyName: companies.get(String(r.cik))?.name ?? null,
      companyDescription: companies.get(String(r.cik))?.description ?? null,
      key: String(r.key),
      ticker: String(r.ticker),
      cik: String(r.cik),
      accession: String(r.accession),
      form: String(r.form),
      filingDate: String(r.filing_date),
      kind: String(r.kind),
      severity: String(r.severity),
      direction: r.direction == null ? 'bearish' : String(r.direction),
      headline: String(r.headline),
      detail: r.detail == null ? '' : String(r.detail),
      marketCap: r.market_cap == null ? null : Number(r.market_cap),
      focus: Number(r.focus ?? 0) === 1,
      firstSeenAt: String(r.first_seen_at),
      jobStatus: r.job_status == null ? null : String(r.job_status),
      verdict: r.verdict == null ? null : String(r.verdict),
      conviction: r.conviction == null ? null : Number(r.conviction),
      altVerdict: r.alt_verdict == null ? null : String(r.alt_verdict),
    }));
  } catch {
    return [];
  }
}

export interface RadarAssessment {
  ticker: string;
  cik: string;
  companyName: string | null;
  companyDescription: string | null;
  form: string;
  filingDate: string;
  status: string;
  triageScore: number | null;
  escalated: boolean;
  verdict: string | null;
  conviction: number | null;
  error: string | null;
  assessment: MispricingAssessment | null; // parsed; null when the job didn't escalate
  /** Which model produced the primary assessment. Null on pre-compare rows. */
  model: string | null;
  cost: number | null;
  /** The comparison leg — a second synthesis on the other provider. */
  alt: {
    model: string;
    verdict: string | null;
    conviction: number | null;
    cost: number | null;
    assessment: MispricingAssessment | null;
  } | null;
}

// Assessments written before the direction-agnostic reframe used short-only
// field names (bullCase, mechanicalRisks) and no `direction`. Map them to the
// current shape at read time so the detail page renders old rows without
// crashing and without per-field defensive checks. For a legacy short call the
// old bull case IS the counter-thesis, so the mapping is faithful.
function normalizeAssessment(raw: unknown): MispricingAssessment | null {
  if (raw == null || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const legacy = a as { bullCase?: unknown; mechanicalRisks?: unknown };
  return {
    ...(a as object),
    counterThesis: a.counterThesis ?? legacy.bullCase ?? '',
    executionRisks: a.executionRisks ?? legacy.mechanicalRisks ?? [],
    direction: a.direction ?? 'none',
  } as MispricingAssessment;
}

/** The deep-dive result for one filing (accession), for the detail page. */
export async function getRadarAssessment(accession: string): Promise<RadarAssessment | null> {
  try {
    const res = await db().execute({
      sql: `SELECT j.ticker, j.form, j.filing_date, j.status, j.triage_score, j.escalated,
                   j.verdict, j.conviction, j.assessment_json, j.error, j.model, j.cost,
                   j.alt_model, j.alt_verdict, j.alt_conviction, j.alt_assessment_json, j.alt_cost,
                   (SELECT cik FROM short_radar WHERE accession = j.accession LIMIT 1) AS cik
            FROM radar_jobs j WHERE j.accession = ? LIMIT 1`,
      args: [accession],
    });
    const r = res.rows[0];
    if (!r) return null;
    const parse = (raw: unknown): MispricingAssessment | null => {
      if (raw == null) return null;
      try {
        return normalizeAssessment(JSON.parse(String(raw)));
      } catch {
        return null;
      }
    };
    const assessment = parse(r.assessment_json);
    // Same isolation as the feed: a missing radar_companies table (sweep not
    // yet migrated) costs the name line, never the assessment.
    let company: { name: string; description: string | null } | null = null;
    if (r.cik != null) {
      try {
        const c = await db().execute({
          sql: `SELECT name, description FROM radar_companies WHERE cik = ? LIMIT 1`,
          args: [String(r.cik)],
        });
        const row = c.rows[0];
        if (row) {
          company = {
            name: String(row.name),
            description: row.description == null ? null : String(row.description),
          };
        }
      } catch {
        company = null;
      }
    }
    return {
      ticker: String(r.ticker),
      cik: r.cik == null ? '0' : String(r.cik),
      companyName: company?.name ?? null,
      companyDescription: company?.description ?? null,
      form: String(r.form),
      filingDate: String(r.filing_date),
      status: String(r.status),
      triageScore: r.triage_score == null ? null : Number(r.triage_score),
      escalated: Boolean(r.escalated),
      verdict: r.verdict == null ? null : String(r.verdict),
      conviction: r.conviction == null ? null : Number(r.conviction),
      error: r.error == null ? null : String(r.error),
      assessment,
      model: r.model == null ? null : String(r.model),
      cost: r.cost == null ? null : Number(r.cost),
      alt:
        r.alt_model == null
          ? null
          : {
              model: String(r.alt_model),
              verdict: r.alt_verdict == null ? null : String(r.alt_verdict),
              conviction: r.alt_conviction == null ? null : Number(r.alt_conviction),
              cost: r.alt_cost == null ? null : Number(r.alt_cost),
              assessment: parse(r.alt_assessment_json),
            },
    };
  } catch {
    return null;
  }
}

/** EDGAR filing-index URL for a signal's source filing. */
export function edgarFilingUrl(cik: string, accession: string): string {
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replace(/-/g, '')}`;
}
