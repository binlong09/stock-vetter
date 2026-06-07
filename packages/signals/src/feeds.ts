// feeds.ts — adapters that pull new events for a ticker from external data
// sources, each normalized to the common `Event` shape the rest of the signal
// tracker consumes.
//
// Sources wired (per the Phase 0 gate — FMP Starter tier):
//   - SEC EDGAR (free): recent 8-K / 10-Q / 10-K filings. The company-reported
//     half — guidance (8-K Ex-99.1), MD&A + cash-flow capex (10-Q/10-K). We
//     reuse the same submissions endpoint packages/pipeline uses; Phase 1 only
//     lists filings as Events (no parsing/LLM — that's Phase 2).
//   - FMP consensus estimates (annual only on Starter).
//   - FMP analyst-ratings bull-index (monthly; our estimate-revision PROXY).
//
// NOT wired (gated on Starter / out of scope for Phase 1): earnings-call
// transcripts (402), quarterly estimates, Yahoo price. TSMC-style foreign-filer
// watch-items are handled as `manual` Events (see toManualEvent), not a feed.
//
// The low-level fetchers (fetchConsensusEstimates, fetchEstimateRevisions,
// fetchLatestTranscript, …) return source-shaped data; the `to*Event(s)`
// functions below normalize them to `Event`. track.ts/diff.ts work in Events.
//
// Conventions inherited from packages/pipeline:
//   - Zod validates every external response at the boundary; we never trust an
//     upstream's shape. Throw on unrecoverable errors (no error-object returns).
//   - Functional composition, one concept per function, no `any`.

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { type Event } from '@stock-vetter/schema';

// Thrown when an FMP endpoint is gated behind a higher subscription tier than
// the current key (HTTP 402, or a 200/403 body whose message says the endpoint
// is restricted/legacy). The signal tracker catches this to report "this
// series is not in the current FMP tier" instead of treating it as a hard
// failure — which is exactly the Phase 0 question.
export class FmpTierError extends Error {
  constructor(
    public readonly endpoint: string,
    message: string,
  ) {
    super(message);
    this.name = 'FmpTierError';
  }
}

// FMP's "stable" API base. The legacy `/api/v3` base still works but FMP is
// migrating callers to `/stable`; we use stable for new code. The API key is
// passed as the `apikey` query param on every request.
const FMP_BASE = 'https://financialmodelingprep.com/stable';

function apiKey(): string {
  const key = process.env.FMP_API_KEY;
  if (!key) {
    throw new Error(
      'FMP_API_KEY is not set. Add it to .env or your environment ' +
        '(get a key at https://site.financialmodelingprep.com/developer/docs).',
    );
  }
  return key;
}

// Single choke-point for FMP requests: builds the URL with the api key, fetches,
// and surfaces FMP's two failure modes clearly.
//   - A non-2xx HTTP status (bad key, rate limit, plan-gated endpoint) throws.
//   - A 200 response carrying an `{ "Error Message": ... }` body (FMP's way of
//     reporting plan/permission problems with a 200) throws with that message —
//     this is the signal that an endpoint is NOT in the current tier, which is
//     exactly what Phase 0 needs to surface clearly.
async function fmpGet(
  path: string,
  params: Record<string, string | number> = {},
): Promise<unknown> {
  const url = new URL(`${FMP_BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  url.searchParams.set('apikey', apiKey());

  const res = await fetch(url);
  const body = await res.text();

  // FMP gates whole endpoints AND individual parameter values by tier, and
  // reports both with HTTP 402. Distinguish them:
  //   - "Restricted Endpoint" / "Special Endpoint" → the endpoint, or a
  //     specific SYMBOL on it, is not in the tier (coverage gap). A clean tier
  //     signal we skip. FMP sometimes prefixes these with "Premium Query
  //     Parameter:" (e.g. "Premium Query Parameter: 'Special Endpoint : this
  //     value set for 'symbol' is not available…" for MU on Starter) — the
  //     "Special Endpoint" / unsupported-symbol meaning wins regardless.
  //   - "Premium Query Parameter" / "Special Parameters" WITHOUT a Special/
  //     Restricted-Endpoint marker → the endpoint IS in the tier but a param
  //     VALUE we control is wrong (limit too high, period=quarter). That's a
  //     caller bug, surfaced as a normal error to fix.
  const isEndpointGating = /Restricted Endpoint|Special Endpoint/i.test(body);
  const isParamGating =
    !isEndpointGating && /Premium Query Parameter|Special Parameters/i.test(body);
  if (isEndpointGating) {
    throw new FmpTierError(path, body.slice(0, 300));
  }
  if (res.status === 402 && isParamGating) {
    throw new Error(`FMP parameter not allowed on this tier for ${path}: ${body.slice(0, 300)}`);
  }
  if (res.status === 402) {
    throw new FmpTierError(path, body.slice(0, 300));
  }
  // 403 with a "Legacy Endpoint" body is the v3-deprecation message — also a
  // tier/availability signal rather than a transient failure.
  if (res.status === 403 && /Legacy Endpoint/i.test(body)) {
    throw new FmpTierError(path, body.slice(0, 300));
  }

  if (!res.ok) {
    // Redact the key before echoing the URL in an error.
    const safeUrl = url.toString().replace(/apikey=[^&]+/, 'apikey=***');
    throw new Error(`FMP ${res.status} for ${safeUrl}: ${body.slice(0, 300)}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new Error(`FMP returned non-JSON for ${path}: ${body.slice(0, 200)}`);
  }

  // FMP signals plan/permission errors as a 200/4xx body with an "Error
  // Message" key. Treat restricted/legacy text as a tier signal; anything else
  // is a real error.
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    const errMsg = (json as Record<string, unknown>)['Error Message'];
    if (typeof errMsg === 'string') {
      if (/Restricted|Legacy|not available under your current subscription/i.test(errMsg)) {
        throw new FmpTierError(path, errMsg);
      }
      throw new Error(`FMP error for ${path}: ${errMsg}`);
    }
  }

  return json;
}

// ---- 1. Earnings-call transcripts ----------------------------------------

// The dated list of available transcripts for a symbol (latest first). We use
// this to discover the most recent quarter, then pull its full text.
const TranscriptDate = z.object({
  // FMP returns either {quarter, year, date} or {fiscalYear, period, date}
  // depending on endpoint version; accept the union and normalize below.
  symbol: z.string().optional(),
  period: z.union([z.string(), z.number()]).optional(),
  quarter: z.union([z.string(), z.number()]).optional(),
  fiscalYear: z.union([z.string(), z.number()]).optional(),
  year: z.union([z.string(), z.number()]).optional(),
  date: z.string(),
});
const TranscriptDateList = z.array(TranscriptDate);

const TranscriptRecord = z.object({
  symbol: z.string(),
  period: z.union([z.string(), z.number()]).optional(),
  quarter: z.union([z.string(), z.number()]).optional(),
  year: z.union([z.string(), z.number()]).optional(),
  fiscalYear: z.union([z.string(), z.number()]).optional(),
  date: z.string(),
  content: z.string(),
});
const TranscriptRecordList = z.array(TranscriptRecord);

export type EarningsTranscript = {
  symbol: string;
  quarter: string; // e.g. "Q3"
  year: number;
  date: string; // YYYY-MM-DD (or full ISO from FMP)
  content: string; // full transcript text
};

function normalizeQuarter(q: string | number | undefined): string {
  if (q === undefined) return '?';
  const s = String(q);
  return /^\d+$/.test(s) ? `Q${s}` : s;
}

function normalizeYear(y: string | number | undefined): number {
  const n = Number(y);
  return Number.isFinite(n) ? n : 0;
}

// List the available transcript quarters for a symbol, newest first.
export async function fetchTranscriptDates(
  symbol: string,
): Promise<Array<{ quarter: string; year: number; date: string }>> {
  const raw = await fmpGet('earning-call-transcript-dates', { symbol: symbol.toUpperCase() });
  const parsed = TranscriptDateList.parse(raw);
  return parsed
    .map((d) => ({
      quarter: normalizeQuarter(d.quarter ?? d.period),
      year: normalizeYear(d.year ?? d.fiscalYear),
      date: d.date,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

// Fetch the full transcript for a specific (symbol, year, quarter). Quarter may
// be given as "Q3" or 3.
export async function fetchEarningsTranscript(
  symbol: string,
  year: number,
  quarter: string | number,
): Promise<EarningsTranscript> {
  const q = String(quarter).replace(/^Q/i, '');
  const raw = await fmpGet('earning-call-transcript', {
    symbol: symbol.toUpperCase(),
    year,
    quarter: q,
  });
  const parsed = TranscriptRecordList.parse(raw);
  const rec = parsed[0];
  if (!rec) {
    throw new Error(`No transcript content returned for ${symbol} ${year} Q${q}.`);
  }
  return {
    symbol: rec.symbol.toUpperCase(),
    quarter: normalizeQuarter(rec.quarter ?? rec.period ?? q),
    year: normalizeYear(rec.year ?? rec.fiscalYear ?? year),
    date: rec.date,
    content: rec.content,
  };
}

// Convenience: discover and fetch the single most recent transcript for a
// symbol. This is the Phase 0 happy path.
export async function fetchLatestTranscript(symbol: string): Promise<EarningsTranscript> {
  const dates = await fetchTranscriptDates(symbol);
  const latest = dates[0];
  if (!latest) {
    throw new Error(`No earnings-call transcripts available for ${symbol}.`);
  }
  return fetchEarningsTranscript(symbol, latest.year, latest.quarter);
}

// ---- 2. Consensus analyst estimates --------------------------------------

// FMP's analyst-estimates endpoint returns one row per fiscal period with the
// consensus (averaged) and the high/low/number-of-analysts for the headline
// lines. We keep revenue and EPS — the two consensus figures the thesis
// tracker reasons about — plus the analyst count (a confidence signal).
const AnalystEstimate = z
  .object({
    symbol: z.string(),
    date: z.string(),
    revenueAvg: z.number().nullable().optional(),
    revenueLow: z.number().nullable().optional(),
    revenueHigh: z.number().nullable().optional(),
    epsAvg: z.number().nullable().optional(),
    epsLow: z.number().nullable().optional(),
    epsHigh: z.number().nullable().optional(),
    numAnalystsRevenue: z.number().nullable().optional(),
    numAnalystsEps: z.number().nullable().optional(),
  })
  .passthrough();
const AnalystEstimateList = z.array(AnalystEstimate);

export type ConsensusEstimate = {
  symbol: string;
  date: string; // fiscal period the estimate is for
  revenueAvg: number | null;
  revenueLow: number | null;
  revenueHigh: number | null;
  epsAvg: number | null;
  epsLow: number | null;
  epsHigh: number | null;
  numAnalystsRevenue: number | null;
  numAnalystsEps: number | null;
};

export async function fetchConsensusEstimates(
  symbol: string,
  limit = 8,
): Promise<ConsensusEstimate[]> {
  const raw = await fmpGet('analyst-estimates', {
    symbol: symbol.toUpperCase(),
    period: 'annual',
    page: 0,
    limit,
  });
  const parsed = AnalystEstimateList.parse(raw);
  return parsed
    .map((e) => ({
      symbol: e.symbol.toUpperCase(),
      date: e.date,
      revenueAvg: e.revenueAvg ?? null,
      revenueLow: e.revenueLow ?? null,
      revenueHigh: e.revenueHigh ?? null,
      epsAvg: e.epsAvg ?? null,
      epsLow: e.epsLow ?? null,
      epsHigh: e.epsHigh ?? null,
      numAnalystsRevenue: e.numAnalystsRevenue ?? null,
      numAnalystsEps: e.numAnalystsEps ?? null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ---- 3. Estimate-revision history ----------------------------------------

// FMP's `grades-historical` (stable) does NOT return per-analyst grade-change
// actions on the base tier — that lives on the gated `grades-news` endpoint.
// What the base tier DOES return is the monthly analyst-ratings *distribution*:
// counts of strong-buy / buy / hold / sell / strong-sell as of each month-end.
//
// That is actually the better "is consensus moving?" signal for a thesis
// tracker: month-over-month drift in the distribution (e.g. holds converting to
// buys) is exactly "consensus catching up ⇒ getting priced in". We normalize
// each monthly snapshot and let the caller diff consecutive months.
const RatingsSnapshot = z
  .object({
    symbol: z.string(),
    date: z.string(),
    analystRatingsStrongBuy: z.number().nullable().optional(),
    analystRatingsBuy: z.number().nullable().optional(),
    analystRatingsHold: z.number().nullable().optional(),
    analystRatingsSell: z.number().nullable().optional(),
    analystRatingsStrongSell: z.number().nullable().optional(),
  })
  .passthrough();
const RatingsSnapshotList = z.array(RatingsSnapshot);

export type EstimateRevision = {
  symbol: string;
  date: string; // month-end snapshot date
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
  total: number;
  // A single-number sentiment index: + skews bullish, - skews bearish.
  // (strongBuy*2 + buy) - (sell + strongSell*2), so the *change* in this index
  // month-over-month is the revision-trend signal the evaluator consumes.
  bullIndex: number;
};

// `limit` defaults to 10 — the base FMP tier caps this endpoint's `limit` at
// 10 (a higher value returns a 402 "Special Parameters" error). 10 monthly
// snapshots ≈ a trailing year of distribution drift, which is plenty for the
// revision-trend signal.
export async function fetchEstimateRevisions(
  symbol: string,
  limit = 10,
): Promise<EstimateRevision[]> {
  const raw = await fmpGet('grades-historical', {
    symbol: symbol.toUpperCase(),
    limit,
  });
  const parsed = RatingsSnapshotList.parse(raw);
  return parsed
    .map((g) => {
      const strongBuy = g.analystRatingsStrongBuy ?? 0;
      const buy = g.analystRatingsBuy ?? 0;
      const hold = g.analystRatingsHold ?? 0;
      const sell = g.analystRatingsSell ?? 0;
      const strongSell = g.analystRatingsStrongSell ?? 0;
      return {
        symbol: g.symbol.toUpperCase(),
        date: g.date,
        strongBuy,
        buy,
        hold,
        sell,
        strongSell,
        total: strongBuy + buy + hold + sell + strongSell,
        bullIndex: strongBuy * 2 + buy - (sell + strongSell * 2),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

// ---- 4. SEC EDGAR filings (8-K / 10-Q / 10-K) ----------------------------
//
// The company-reported half. We reuse the same EDGAR submissions endpoint
// packages/pipeline/src/sec-filings.ts uses (ticker → CIK → recent filings),
// but list MULTIPLE recent filings of MULTIPLE forms since a date — which the
// pipeline's `findLatestFiling` (single-form, latest-only) doesn't do. Phase 1
// only surfaces filing metadata + the document URL as Events; parsing the
// guidance/MD&A/capex out of the document body is Phase 2's LLM job.
//
// (When the packages/core extraction happens at the Phase 1→2 boundary, the
// ticker→CIK map and submissions fetch move there and both packages share them.
// Until then this is a deliberately small, self-contained duplicate.)

const SEC_USER_AGENT =
  process.env.SEC_USER_AGENT ?? 'stock-vetter (https://example.com / contact@example.com)';

// SEC forms we ingest, mapped to our Event source tags.
const SEC_FORM_TO_SOURCE = {
  '8-K': 'sec-8k',
  '10-Q': 'sec-10q',
  '10-K': 'sec-10k',
} as const;
type SecForm = keyof typeof SEC_FORM_TO_SOURCE;

let _tickerToCikCache: Map<string, string> | null = null;

async function loadTickerToCik(): Promise<Map<string, string>> {
  if (_tickerToCikCache) return _tickerToCikCache;
  const res = await fetch('https://www.sec.gov/files/company_tickers.json', {
    headers: { 'User-Agent': SEC_USER_AGENT },
  });
  if (!res.ok) throw new Error(`SEC ticker list fetch failed: ${res.status}`);
  const json = (await res.json()) as Record<string, { cik_str: number; ticker: string }>;
  const map = new Map<string, string>();
  for (const v of Object.values(json)) {
    map.set(v.ticker.toUpperCase(), String(v.cik_str).padStart(10, '0'));
  }
  _tickerToCikCache = map;
  return map;
}

const SecSubmissions = z.object({
  cik: z.union([z.string(), z.number()]).optional(),
  filings: z.object({
    recent: z.object({
      accessionNumber: z.array(z.string()),
      filingDate: z.array(z.string()),
      form: z.array(z.string()),
      primaryDocument: z.array(z.string()),
      primaryDocDescription: z.array(z.string()).optional(),
    }),
  }),
});

export type SecFiling = {
  ticker: string;
  cik: string;
  accession: string;
  form: SecForm;
  filingDate: string; // YYYY-MM-DD
  primaryDocument: string;
  primaryDocDescription: string | null;
  url: string; // direct link to the primary document on EDGAR
};

function edgarDocUrl(cik: string, accession: string, primaryDoc: string): string {
  const accNoDash = accession.replace(/-/g, '');
  const cikInt = String(parseInt(cik, 10));
  return `https://www.sec.gov/Archives/edgar/data/${cikInt}/${accNoDash}/${primaryDoc}`;
}

// List recent 8-K/10-Q/10-K filings for a ticker filed on or after `sinceDate`
// (YYYY-MM-DD; omit for "all in the recent window"). Newest first. The EDGAR
// `recent` block already holds roughly the last ~1 year / 1000 filings, which
// is ample for a daily/weekly tracker.
export async function fetchRecentSecFilings(
  ticker: string,
  sinceDate?: string,
): Promise<SecFiling[]> {
  const upper = ticker.toUpperCase();
  const cik = (await loadTickerToCik()).get(upper);
  if (!cik) throw new Error(`SEC: ticker not found: ${upper}`);

  const res = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
    headers: { 'User-Agent': SEC_USER_AGENT },
  });
  if (!res.ok) throw new Error(`SEC submissions fetch failed for ${upper}: ${res.status}`);
  const sub = SecSubmissions.parse(await res.json());
  const r = sub.filings.recent;

  const out: SecFiling[] = [];
  for (let i = 0; i < r.form.length; i++) {
    const form = r.form[i];
    if (!form || !(form in SEC_FORM_TO_SOURCE)) continue;
    const filingDate = r.filingDate[i] ?? '';
    if (sinceDate && filingDate < sinceDate) continue;
    const accession = r.accessionNumber[i] ?? '';
    const primaryDoc = r.primaryDocument[i] ?? '';
    out.push({
      ticker: upper,
      cik,
      accession,
      form: form as SecForm,
      filingDate,
      primaryDocument: primaryDoc,
      primaryDocDescription: r.primaryDocDescription?.[i] ?? null,
      url: edgarDocUrl(cik, accession, primaryDoc),
    });
  }
  return out.sort((a, b) => b.filingDate.localeCompare(a.filingDate));
}

// =========================================================================
// Event normalization — every source funnels into the common `Event` shape.
// dedupKey rules (must be stable across runs for the same underlying fact):
//   - SEC:        accession number (globally unique per filing).
//   - estimates:  `${ticker}:estimates:${hash(snapshot)}` — changes only when
//                 the consensus numbers actually move.
//   - revisions:  `${ticker}:revisions:${snapshotDate}` — one per month.
//   - manual:     caller-supplied id.
// =========================================================================

function shortHash(input: unknown): string {
  return createHash('sha1').update(JSON.stringify(input)).digest('hex').slice(0, 12);
}

export function toSecEvent(filing: SecFiling): Event {
  const desc = filing.primaryDocDescription ? ` — ${filing.primaryDocDescription}` : '';
  return {
    dedupKey: filing.accession,
    source: SEC_FORM_TO_SOURCE[filing.form],
    ticker: filing.ticker,
    date: filing.filingDate,
    title: `${filing.form} filed ${filing.filingDate}${desc}`,
    url: filing.url,
    payload: {
      accession: filing.accession,
      form: filing.form,
      primaryDocument: filing.primaryDocument,
      primaryDocDescription: filing.primaryDocDescription,
    },
    dataQuality: `source=SEC EDGAR ${filing.form}; filing metadata only (body not yet parsed)`,
  };
}

// The whole consensus snapshot collapses to ONE event whose identity is the
// hash of the numbers — so a re-run with unchanged consensus produces the same
// dedupKey (no new event), and a real revision produces a new one.
export function toEstimatesEvent(ticker: string, estimates: ConsensusEstimate[]): Event | null {
  if (!estimates.length) return null;
  const upper = ticker.toUpperCase();
  // Hash the figures only (not analyst counts, which jitter) so the event fires
  // when consensus actually moves.
  const figures = estimates.map((e) => ({
    date: e.date,
    revenueAvg: e.revenueAvg,
    epsAvg: e.epsAvg,
  }));
  const latest = estimates[estimates.length - 1]!;
  return {
    dedupKey: `${upper}:estimates:${shortHash(figures)}`,
    source: 'fmp-estimates',
    ticker: upper,
    date: latest.date.slice(0, 10),
    title:
      `Consensus estimates snapshot (${estimates.length} annual periods; ` +
      `latest FY ${latest.date.slice(0, 4)} rev avg ` +
      `${latest.revenueAvg != null ? `$${(latest.revenueAvg / 1e9).toFixed(1)}B` : '—'}, ` +
      `EPS ${latest.epsAvg != null ? latest.epsAvg.toFixed(2) : '—'})`,
    url: null,
    payload: { estimates: figures },
    dataQuality: 'source=FMP analyst-estimates; consensus=annual-only (Starter tier)',
  };
}

// One event per monthly ratings snapshot, carrying the month-over-month
// bull-index delta (computed by the caller from consecutive snapshots) when
// available. Identity is ticker+month so re-runs don't re-emit old months.
export function toRevisionEvent(rev: EstimateRevision, priorBullIndex: number | null): Event {
  const delta = priorBullIndex == null ? null : rev.bullIndex - priorBullIndex;
  const deltaStr = delta == null ? 'first snapshot' : delta > 0 ? `+${delta}` : `${delta}`;
  return {
    dedupKey: `${rev.symbol}:revisions:${rev.date.slice(0, 10)}`,
    source: 'fmp-revisions',
    ticker: rev.symbol,
    date: rev.date.slice(0, 10),
    title:
      `Analyst-ratings snapshot ${rev.date.slice(0, 10)}: bull-index ${rev.bullIndex} ` +
      `(Δ ${deltaStr} vs prior month; ${rev.total} analysts)`,
    url: null,
    payload: {
      strongBuy: rev.strongBuy,
      buy: rev.buy,
      hold: rev.hold,
      sell: rev.sell,
      strongSell: rev.strongSell,
      total: rev.total,
      bullIndex: rev.bullIndex,
      bullIndexDelta: delta,
    },
    dataQuality:
      'source=FMP grades-historical; revision=ratings-bull-index-proxy ' +
      '(monthly ratings distribution, NOT true per-analyst estimate revisions)',
  };
}

// Build a manual Event for a watch-item with no feed on our tier (e.g. TSMC
// capex). The caller supplies the facts; we just normalize + tag dataQuality.
export function toManualEvent(input: {
  id: string;
  ticker: string;
  date: string;
  title: string;
  url?: string | null;
  payload?: Record<string, unknown>;
  note?: string;
}): Event {
  return {
    dedupKey: `manual:${input.id}`,
    source: 'manual',
    ticker: input.ticker.toUpperCase(),
    date: input.date,
    title: input.title,
    url: input.url ?? null,
    payload: input.payload ?? {},
    dataQuality: `source=manual entry; not independently verified${input.note ? `; ${input.note}` : ''}`,
  };
}

// Convenience: pull all auto-feed Events for a single ticker (SEC + estimates +
// revisions), best-effort per source. A source that errors (e.g. FMP tier gate,
// SEC hiccup) is logged to stderr and skipped — one dead source shouldn't blank
// the whole run. `sinceDate` bounds the SEC query.
// Log a per-source fetch failure. A FmpTierError is EXPECTED coverage (e.g. MU
// isn't on the FMP Starter tier) — log it as a concise one-line "skipped",
// not a scary multi-line error, since it recurs every run and isn't actionable.
function logSourceIssue(source: string, ticker: string, err: unknown): void {
  if (err instanceof FmpTierError) {
    process.stderr.write(`[feeds:${source}] ${ticker}: not on FMP tier — skipped\n`);
  } else {
    process.stderr.write(`[feeds:${source}] ${ticker}: ${err instanceof Error ? err.message : err}\n`);
  }
}

export async function fetchTickerEvents(
  ticker: string,
  opts: { sinceDate?: string } = {},
): Promise<Event[]> {
  const events: Event[] = [];

  // SEC filings.
  try {
    const filings = await fetchRecentSecFilings(ticker, opts.sinceDate);
    events.push(...filings.map(toSecEvent));
  } catch (err) {
    logSourceIssue('sec', ticker, err);
  }

  // Consensus estimates (one collapsed event).
  try {
    const estimates = await fetchConsensusEstimates(ticker);
    const ev = toEstimatesEvent(ticker, estimates);
    if (ev) events.push(ev);
  } catch (err) {
    logSourceIssue('estimates', ticker, err);
  }

  // Ratings-distribution revisions (one event per month, newest first; attach
  // the month-over-month bull-index delta).
  try {
    const revs = await fetchEstimateRevisions(ticker); // newest-first
    for (let i = 0; i < revs.length; i++) {
      const prior = revs[i + 1]; // next index is the older month
      events.push(toRevisionEvent(revs[i]!, prior ? prior.bullIndex : null));
    }
  } catch (err) {
    logSourceIssue('revisions', ticker, err);
  }

  return events.sort((a, b) => b.date.localeCompare(a.date));
}
