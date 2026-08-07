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
