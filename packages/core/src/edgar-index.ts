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

// US federal holidays, on which EDGAR publishes no daily index. It returns 403
// (not 404) for the never-created holiday index file, indistinguishable at the
// HTTP layer from a throttle — so we skip these dates explicitly rather than
// guess. Weekends are skipped separately; a holiday that lands on a weekend is
// OBSERVED on the adjacent weekday (Sat→Fri, Sun→Mon), which is the day with no
// index. Computed per year and memoized.
const holidayCache = new Map<number, Set<string>>();

function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, month, 1 + offset + (n - 1) * 7));
}

function lastWeekday(year: number, month: number, weekday: number): Date {
  const last = new Date(Date.UTC(year, month + 1, 0));
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return new Date(Date.UTC(year, month + 1, 0 - offset));
}

/** The observed date of a fixed-date holiday: shifted off a weekend. */
function observed(year: number, month: number, day: number): Date {
  const d = new Date(Date.UTC(year, month, day));
  const wd = d.getUTCDay();
  if (wd === 6) return new Date(Date.UTC(year, month, day - 1)); // Sat → Fri
  if (wd === 0) return new Date(Date.UTC(year, month, day + 1)); // Sun → Mon
  return d;
}

function usMarketHolidays(year: number): Set<string> {
  let set = holidayCache.get(year);
  if (set) return set;
  const dates: Date[] = [
    observed(year, 0, 1), // New Year's Day
    nthWeekday(year, 0, 1, 3), // MLK Day — 3rd Mon Jan
    nthWeekday(year, 1, 1, 3), // Washington's Birthday — 3rd Mon Feb
    lastWeekday(year, 4, 1), // Memorial Day — last Mon May
    observed(year, 5, 19), // Juneteenth
    observed(year, 6, 4), // Independence Day
    nthWeekday(year, 8, 1, 1), // Labor Day — 1st Mon Sep
    nthWeekday(year, 9, 1, 2), // Columbus Day — 2nd Mon Oct
    observed(year, 10, 11), // Veterans Day
    nthWeekday(year, 10, 4, 4), // Thanksgiving — 4th Thu Nov
    observed(year, 11, 25), // Christmas
  ];
  set = new Set(dates.map((d) => d.toISOString().slice(0, 10)));
  holidayCache.set(year, set);
  return set;
}

export function isUsMarketHoliday(date: Date): boolean {
  return usMarketHolidays(date.getUTCFullYear()).has(date.toISOString().slice(0, 10));
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
    // The live master.idx dates are YYYYMMDD; some historical/full-index dumps
    // use YYYY-MM-DD. Accept both and normalize to ISO for IndexEntry.
    const rawDate = filingDate.trim();
    let iso: string;
    if (/^\d{8}$/.test(rawDate)) iso = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
    else if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) iso = rawDate;
    else continue;
    const m = path.trim().match(/(\d{10}-\d{2}-\d{6})/);
    if (!m) continue;
    out.push({
      cik: cikRaw.trim().padStart(10, '0'),
      companyName: companyName.trim(),
      form: form.trim(),
      filingDate: iso,
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
  // 404 (date not yet posted) → empty. A 403 here is NOT a missing index — the
  // holiday no-index dates are skipped before we ever fetch (see sweepFilings),
  // so a 403 means throttling and must NOT be silently swallowed into "no
  // filings"; it propagates so the caller can record and re-run the day.
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
  /**
   * Called when a single trading day's index can't be fetched (throttle,
   * transient network error). When provided, the sweep records the gap and
   * CONTINUES rather than aborting — the caller reports which days were missed
   * and re-runs them (safe, since downstream dedups). When omitted, the error
   * propagates (fail-fast), preserving the original behaviour.
   */
  onDayError?: (date: string, error: Error) => void;
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
    // Skip weekends and federal holidays outright — EDGAR publishes no index on
    // those days, and probing them wastes requests (and a holiday 403 would be
    // mistaken for a throttle).
    if (day !== 0 && day !== 6 && !isUsMarketHoliday(cursor)) {
      try {
        for (const e of await fetchDailyIndex(cursor)) {
          if (opts.ciks.has(e.cik) && formMatches(e.form, opts.forms)) out.push(e);
        }
      } catch (err) {
        if (!opts.onDayError) throw err;
        opts.onDayError(cursor.toISOString().slice(0, 10), err as Error);
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}
