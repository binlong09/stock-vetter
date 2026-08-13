// Batched market-data screen: price, market cap and liquidity for a few
// thousand tickers at a time.
//
// This exists to answer one question the SEC cannot: how big and how tradable
// is each registrant. EDGAR knows every filer and their CIK; it knows nothing
// about market cap or volume, and market cap is the whole basis for cutting a
// small-cap universe out of the ~10,000 companies that file.
//
// LIQUIDITY IS NOT OPTIONAL DOWN HERE. At mega-cap scale every name is
// tradable and volume can be ignored. At $150M it cannot: a company with
// $200k of average daily turnover is one where a normal position is several
// days of volume to build and several more to exit, the spread eats the edge,
// and there is usually no borrow to short against. A signal on a name like
// that is not an opportunity, it is a distraction — so dollar volume is a
// first-class filter here, not an afterthought.

import YahooFinance from 'yahoo-finance2';

// v3 ships as a class — instantiate once with constructor-level config.
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export type ScreenQuote = {
  ticker: string;
  name: string | null;
  marketCap: number | null;
  price: number | null;
  /** 3-month average share volume; falls back to the 10-day figure. */
  avgVolume: number | null;
  /** price × avgVolume — the number that decides whether a name is tradable. */
  avgDollarVolume: number | null;
  /** Yahoo's instrument type, e.g. EQUITY / ETF. Used to drop funds. */
  quoteType: string | null;
  exchange: string | null;
};

type RawQuote = {
  symbol?: string;
  longName?: string;
  shortName?: string;
  marketCap?: number;
  regularMarketPrice?: number;
  averageDailyVolume3Month?: number;
  averageDailyVolume10Day?: number;
  quoteType?: string;
  fullExchangeName?: string;
};

function toScreenQuote(q: RawQuote): ScreenQuote | null {
  const ticker = q.symbol?.toUpperCase();
  if (!ticker) return null;
  const price = q.regularMarketPrice ?? null;
  const avgVolume = q.averageDailyVolume3Month ?? q.averageDailyVolume10Day ?? null;
  return {
    ticker,
    name: q.longName ?? q.shortName ?? null,
    marketCap: q.marketCap ?? null,
    price,
    avgVolume,
    avgDollarVolume: price != null && avgVolume != null ? price * avgVolume : null,
    quoteType: q.quoteType ?? null,
    exchange: q.fullExchangeName ?? null,
  };
}

export type ScreenOptions = {
  /** Symbols per request. Yahoo tolerates ~40; larger batches fail wholesale. */
  batchSize?: number;
  /**
   * Called with each batch's rows as they arrive, before the whole run
   * finishes. Pricing 10,000 symbols takes minutes; a caller that wants to
   * checkpoint progress to disk needs the rows incrementally, not at the end.
   */
  onBatch?: (rows: ScreenQuote[]) => void | Promise<void>;
  /** Called after each batch with cumulative progress. */
  onProgress?: (done: number, total: number) => void | Promise<void>;
  /**
   * Called when a batch fails outright. One delisted symbol can take its whole
   * batch down, and losing 40 names out of 10,000 does not change a universe —
   * so the default is to note it and continue rather than abort.
   */
  onBatchError?: (symbols: string[], error: Error) => void;
};

/**
 * Price a list of symbols in batches. Returns one row per symbol Yahoo
 * answered for; symbols it doesn't know are simply absent.
 */
export async function screenQuotes(
  symbols: string[],
  opts: ScreenOptions = {},
): Promise<ScreenQuote[]> {
  const batchSize = opts.batchSize ?? 40;
  const out: ScreenQuote[] = [];
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    try {
      const res = await yahooFinance.quote(batch);
      const rows: ScreenQuote[] = [];
      for (const q of Array.isArray(res) ? res : [res]) {
        const row = toScreenQuote(q as RawQuote);
        if (row) rows.push(row);
      }
      out.push(...rows);
      await opts.onBatch?.(rows);
    } catch (e) {
      opts.onBatchError?.(batch, e as Error);
    }
    await opts.onProgress?.(Math.min(i + batchSize, symbols.length), symbols.length);
  }
  return out;
}

// --- business descriptions ---------------------------------------------------

// Legal-suffix and other abbreviations whose trailing period is NOT a sentence
// boundary. Without this, "PAR Technology Corp. provides point-of-sale…" would
// be cut after "Corp." and every description would be a company name.
const NON_TERMINAL =
  /\b(?:Inc|Corp|Co|Ltd|LLC|LP|L\.P|PLC|plc|S\.A|N\.V|A\.G|Pte|Pty|U\.S|U\.K|No|vs|etc|approx|f\/k\/a|d\/b\/a)\.$/;

/**
 * First sentence or two of a business summary, bounded in length.
 *
 * Yahoo's `longBusinessSummary` runs to a full paragraph — products, segments,
 * founding year, headquarters. The feed needs the first clause of that: what
 * the company actually does. Cutting at sentence boundaries (skipping the
 * abbreviation traps above) keeps the result readable; the hard length cap
 * keeps a run-on first sentence from swallowing a card.
 */
export function trimBusinessSummary(text: string | null | undefined, maxLen = 300): string | null {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  const sentences: string[] = [];
  let start = 0;
  for (let i = 0; i < clean.length && sentences.length < 2; i++) {
    const ch = clean[i]!;
    if (ch !== '.' && ch !== '!' && ch !== '?') continue;
    if (i + 1 < clean.length && clean[i + 1] !== ' ') continue;
    const candidate = clean.slice(start, i + 1).trim();
    if (ch === '.' && NON_TERMINAL.test(candidate)) continue;
    const joined = sentences.length ? `${sentences.join(' ')} ${candidate}` : candidate;
    if (sentences.length && joined.length > maxLen) break;
    sentences.push(candidate);
    start = i + 2;
  }
  const s = sentences.length ? sentences.join(' ') : clean;
  return s.length > maxLen ? `${s.slice(0, maxLen - 1).trimEnd()}…` : s;
}

/**
 * The company's business summary from Yahoo's assetProfile, already trimmed.
 * One request per symbol — universe-build cadence, not sweep cadence. Returns
 * null for symbols Yahoo has no profile for; throws on transport errors so the
 * caller's cache/retry logic can tell "no profile" from "network blip".
 */
export async function fetchBusinessSummary(symbol: string): Promise<string | null> {
  const res = (await yahooFinance.quoteSummary(symbol, { modules: ['assetProfile'] })) as {
    assetProfile?: { longBusinessSummary?: string };
  };
  return trimBusinessSummary(res.assetProfile?.longBusinessSummary);
}

// --- point-in-time market snapshot -------------------------------------------

export type MarketSnapshot = {
  ticker: string;
  price: number | null;
  marketCap: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  /** price × 3-month average share volume. */
  avgDollarVolume: number | null;
  /** ISO timestamp of the fetch — this is "now" data, not as-of-filing data. */
  fetchedAt: string;
};

/**
 * Current market context for one symbol, for the synthesis stage.
 *
 * The mispricing verdict is a claim about the PRICE, so the model needs the
 * price — otherwise "is this already priced in" gets answered from stale
 * training-data memory or not at all. Deliberately current rather than
 * as-of-filing: the verdict is "is this tradeable now", and the reader acts
 * now. Throws on transport errors; callers treat the snapshot as optional.
 */
export async function fetchMarketSnapshot(symbol: string): Promise<MarketSnapshot | null> {
  const res = await yahooFinance.quote(symbol);
  const q = (Array.isArray(res) ? res[0] : res) as
    | (RawQuote & { fiftyTwoWeekHigh?: number; fiftyTwoWeekLow?: number })
    | undefined;
  if (!q) return null;
  const price = q.regularMarketPrice ?? null;
  const avgVolume = q.averageDailyVolume3Month ?? q.averageDailyVolume10Day ?? null;
  return {
    ticker: symbol.toUpperCase(),
    price,
    marketCap: q.marketCap ?? null,
    fiftyTwoWeekHigh: q.fiftyTwoWeekHigh ?? null,
    fiftyTwoWeekLow: q.fiftyTwoWeekLow ?? null,
    avgDollarVolume: price != null && avgVolume != null ? price * avgVolume : null,
    fetchedAt: new Date().toISOString(),
  };
}

// --- daily price history ------------------------------------------------------

export type DailyBar = {
  /** Trading date, YYYY-MM-DD. */
  asOf: string;
  /** Raw close — what a share cost that day. */
  close: number;
  /**
   * Split- and dividend-adjusted close. THE field to compute returns from down
   * here: reverse splits are routine below $2B, and a 1-for-10 measured on raw
   * closes reads as a +900% winner. Falls back to `close` when Yahoo omits it.
   */
  adjClose: number;
};

/**
 * Daily bars for one symbol from `since` (inclusive) to now, oldest first.
 *
 * The whole window is re-fetched rather than appended to, on purpose: Yahoo
 * re-adjusts historical `adjclose` when a split or dividend happens, so a
 * series stitched together from incremental fetches would mix adjustment
 * bases and quietly mis-state every return that spans the event.
 *
 * Returns [] for a symbol Yahoo has no bars for (delisted, renamed, or a
 * ticker that never traded); throws on transport errors so callers can retry.
 */
export async function fetchDailyBars(symbol: string, since: Date): Promise<DailyBar[]> {
  const res = await yahooFinance.chart(symbol, {
    period1: since,
    interval: '1d',
    // Ask for the corporate-action events; this is also what makes Yahoo
    // return the adjclose series alongside the raw one.
    events: 'div|split',
  });
  const out: DailyBar[] = [];
  for (const q of res.quotes ?? []) {
    const close = q.close;
    if (close == null || !Number.isFinite(close)) continue; // a halted / no-trade session
    const adj = q.adjclose;
    out.push({
      asOf: q.date.toISOString().slice(0, 10),
      close,
      adjClose: adj != null && Number.isFinite(adj) && adj > 0 ? adj : close,
    });
  }
  out.sort((a, b) => a.asOf.localeCompare(b.asOf));
  return out;
}
