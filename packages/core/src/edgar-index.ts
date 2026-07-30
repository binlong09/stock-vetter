// EDGAR daily/full index sweep.
//
// The watchlist workflow asks "what did NVDA file lately?" — one submissions
// request per ticker. That does not scale to a 2,000-company universe: it is
// 2,000 requests per sweep, ~4 minutes of wall clock at the fair-access rate
// limit, repeated every day, and 99% of the answers are "nothing new".
//
// EDGAR publishes a daily index of EVERY filing accepted that day. One request
// covers the entire market. We fetch it, intersect against the universe's CIK
// set, and come away with the ~10-40 filings that actually matter. Per-company
// requests then happen only for companies that genuinely filed.
//
// Index flavour: `master.<date>.idx` is pipe-delimited, unlike the
// space-padded `form.idx` / `company.idx`. Company names contain runs of
// spaces, so the fixed-width variants need column-offset guessing; the
// pipe-delimited one does not. Always use master.

import { secFetchTextOrNull } from './sec-http.js';

export type IndexEntry = {
  cik: string; // zero-padded to 10, matching FilingMeta.cik
  companyName: string;
  form: string;
  filingDate: string; // YYYY-MM-DD
  accession: string; // 0000320193-25-000073
};

function quarterOf(d: Date): number {
  return Math.floor(d.getUTCMonth() / 3) + 1;
}

function yyyymmdd(d: Date): string {
  return (
    `${d.getUTCFullYear()}` +
    `${String(d.getUTCMonth() + 1).padStart(2, '0')}` +
    `${String(d.getUTCDate()).padStart(2, '0')}`
  );
}

// A master.idx line:
//   320193|Apple Inc.|10-K|2025-11-01|edgar/data/320193/0000320193-25-000073.txt
export function parseMasterIdx(body: string): IndexEntry[] {
  const out: IndexEntry[] = [];
  for (const line of body.split('\n')) {
    const parts = line.split('|');
    if (parts.length < 5) continue;
    const [cikRaw, companyName, form, filingDate, path] = parts as [string, string, string, string, string];
    // Skip the preamble and the dashed rule; only data lines start with digits.
    if (!/^\d+$/.test(cikRaw.trim())) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(filingDate.trim())) continue;
    const m = path.trim().match(/(\d{10}-\d{2}-\d{6})/);
    if (!m) continue;
    out.push({
      cik: cikRaw.trim().padStart(10, '0'),
      companyName: companyName.trim(),
      form: form.trim(),
      filingDate: filingDate.trim(),
      accession: m[1]!,
    });
  }
  return out;
}

/**
 * All filings EDGAR accepted on one date. Returns [] for weekends, holidays,
 * and dates whose index hasn't been published yet — the caller can't tell
 * those apart from a genuinely empty day, and shouldn't need to.
 */
export async function fetchDailyIndex(date: Date): Promise<IndexEntry[]> {
  const url =
    `https://www.sec.gov/Archives/edgar/daily-index/${date.getUTCFullYear()}` +
    `/QTR${quarterOf(date)}/master.${yyyymmdd(date)}.idx`;
  const body = await secFetchTextOrNull(url);
  if (body == null) return [];
  return parseMasterIdx(body);
}

export type SweepOptions = {
  /** CIKs to keep, zero-padded to 10. Everything else is discarded. */
  ciks: Set<string>;
  /** Forms to keep, e.g. ['10-K', '10-Q', '8-K']. Amendments (`/A`) included. */
  forms: string[];
  /** Inclusive start date. */
  since: Date;
  /** Inclusive end date. Defaults to today (UTC). */
  until?: Date;
};

// Match "10-K" against both "10-K" and "10-K/A". An amended filing is often
// the more interesting one for short work — a 10-K/A that restates is a
// louder signal than the original.
function formMatches(form: string, wanted: string[]): boolean {
  const f = form.toUpperCase();
  return wanted.some((w) => {
    const W = w.toUpperCase();
    return f === W || f.startsWith(`${W}/`);
  });
}

/**
 * Sweep the daily indexes across a date range and return only the filings
 * belonging to the universe. One EDGAR request per calendar day, regardless
 * of universe size.
 */
export async function sweepFilings(opts: SweepOptions): Promise<IndexEntry[]> {
  const until = opts.until ?? new Date();
  const out: IndexEntry[] = [];
  const cursor = new Date(
    Date.UTC(opts.since.getUTCFullYear(), opts.since.getUTCMonth(), opts.since.getUTCDate()),
  );
  const end = Date.UTC(until.getUTCFullYear(), until.getUTCMonth(), until.getUTCDate());
  while (cursor.getTime() <= end) {
    const day = cursor.getUTCDay();
    // Skip weekends outright — EDGAR publishes no index and the 404 probe
    // would burn two requests per week for nothing.
    if (day !== 0 && day !== 6) {
      for (const e of await fetchDailyIndex(cursor)) {
        if (opts.ciks.has(e.cik) && formMatches(e.form, opts.forms)) out.push(e);
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}
