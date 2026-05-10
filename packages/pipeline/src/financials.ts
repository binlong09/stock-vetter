import YahooFinance from 'yahoo-finance2';
import type { AnnualRow, FinancialSnapshot } from '@stock-vetter/schema';

// v3 ships as a class — instantiate once with constructor-level config.
const yahooFinance = new YahooFinance({
  suppressNotices: ['yahooSurvey'],
});

const SEC_USER_AGENT =
  process.env.SEC_USER_AGENT ?? 'stock-vetter (https://example.com / contact@example.com)';

type SecFactValue = {
  end: string;
  val: number;
  fy?: number;
  fp?: string;
  form?: string;
  start?: string;
};

type SecCompanyFacts = {
  cik: number;
  entityName?: string;
  facts?: {
    'us-gaap'?: Record<string, { units?: Record<string, SecFactValue[]> }>;
    ifrs?: Record<string, { units?: Record<string, SecFactValue[]> }>;
    dei?: Record<string, { units?: Record<string, SecFactValue[]> }>;
  };
};

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

async function fetchCompanyFacts(cik: string): Promise<SecCompanyFacts | null> {
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
  const res = await fetch(url, { headers: { 'User-Agent': SEC_USER_AGENT } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`SEC companyfacts fetch failed: ${res.status}`);
  return (await res.json()) as SecCompanyFacts;
}

function pickConcept(
  facts: SecCompanyFacts,
  candidates: string[],
  unit = 'USD',
): SecFactValue[] {
  // Merge across candidate concept names. Companies frequently change which
  // GAAP concept they report — META switched from `Revenues` to
  // `RevenueFromContractWithCustomerExcludingAssessedTax` in 2018 when
  // ASC 606 took effect. Returning only the first concept that exists
  // misses years reported under a different concept name. Instead, take
  // values from all candidate concepts, in priority order, and keep the
  // first one that has data for each fiscal year.
  const ns = facts.facts?.['us-gaap'] ?? facts.facts?.ifrs ?? {};
  const byYearAndPeriod = new Map<string, SecFactValue>();
  for (const name of candidates) {
    const concept = ns[name];
    const units = concept?.units?.[unit];
    if (!units) continue;
    for (const v of units) {
      // Key by (fy, fp) so we don't conflate FY annual entries with quarterly.
      // Earlier-priority candidates win because we only set if not present.
      const key = `${v.fy ?? '?'}_${v.fp ?? '?'}_${v.start ?? ''}_${v.end ?? ''}`;
      if (!byYearAndPeriod.has(key)) byYearAndPeriod.set(key, v);
    }
  }
  return Array.from(byYearAndPeriod.values());
}

function annualValues(values: SecFactValue[]): SecFactValue[] {
  // SEC company-facts has two kinds of FY entries:
  //   - period values (income statement, cash flow): have both `start` and
  //     `end`; the reporting period must span fiscal year `fy`.
  //   - instant values (balance sheet): have only `end` (no `start`); the
  //     end-of-period balance must fall in fiscal year `fy`.
  //
  // For both kinds, each year typically has multiple entries (one per 10-K
  // that re-reported that year as comparative data) — we keep the most
  // authoritative one. Without the year-must-match guard, comparative
  // entries from later filings get assigned to the wrong fy.
  const byKey = new Map<string, SecFactValue>();
  for (const v of values) {
    if (v.fp !== 'FY') continue;
    if (!v.fy) continue;
    if (!v.end) continue;
    if (v.start) {
      // Period value — start year must equal fy.
      const startYear = parseInt(v.start.slice(0, 4), 10);
      if (startYear !== v.fy) continue;
    } else {
      // Instant value (balance sheet) — end year must equal fy.
      const endYear = parseInt(v.end.slice(0, 4), 10);
      if (endYear !== v.fy) continue;
    }
    const key = `${v.fy}_${v.start ?? 'instant'}_${v.end}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, v);
      continue;
    }
    const rank = (form?: string) =>
      form === '10-K' ? 3 : form === '10-K/A' ? 2 : form === '20-F' ? 2 : 1;
    if (rank(v.form) > rank(existing.form)) byKey.set(key, v);
  }
  // Dedupe by fy: pick the entry with the latest end date (most recent
  // restatement of that year's figure).
  const byYear = new Map<number, SecFactValue>();
  for (const v of byKey.values()) {
    const cur = byYear.get(v.fy!);
    if (!cur || (v.end ?? '') > (cur.end ?? '')) byYear.set(v.fy!, v);
  }
  return Array.from(byYear.values()).sort((a, b) => (a.fy ?? 0) - (b.fy ?? 0));
}

function median(nums: number[]): number | null {
  const xs = nums.filter((n) => Number.isFinite(n));
  if (!xs.length) return null;
  xs.sort((a, b) => a - b);
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 === 0 ? (xs[mid - 1]! + xs[mid]!) / 2 : xs[mid]!;
}

function computeShareCountTrend(
  annual: AnnualRow[],
): 'shrinking' | 'flat' | 'growing' {
  if (annual.length < 2) return 'flat';
  // 3-year window, trailing
  const window = annual.slice(-4); // includes endpoints for 3-year span
  if (window.length < 2) return 'flat';
  const first = window[0]!.sharesOutstanding;
  const last = window[window.length - 1]!.sharesOutstanding;
  const years = window.length - 1;
  if (first <= 0 || last <= 0) return 'flat';
  const cagr = Math.pow(last / first, 1 / years) - 1;
  if (cagr > 0.02) return 'growing';
  if (cagr < -0.01) return 'shrinking';
  return 'flat';
}

function buildAnnualRows(facts: SecCompanyFacts): AnnualRow[] {
  const revenue = annualValues(
    pickConcept(facts, [
      'Revenues',
      'RevenueFromContractWithCustomerExcludingAssessedTax',
      'SalesRevenueNet',
      'RevenueFromContractWithCustomerIncludingAssessedTax',
    ]),
  );
  const ebit = annualValues(pickConcept(facts, ['OperatingIncomeLoss']));
  const netIncome = annualValues(pickConcept(facts, ['NetIncomeLoss', 'ProfitLoss']));
  const cfo = annualValues(
    pickConcept(facts, [
      'NetCashProvidedByUsedInOperatingActivities',
      'CashFlowsFromOperatingActivities',
    ]),
  );
  const capex = annualValues(
    pickConcept(facts, [
      'PaymentsToAcquirePropertyPlantAndEquipment',
      'PaymentsForCapitalImprovements',
    ]),
  );
  // Diluted weighted-average shares is the right denominator for per-share
  // metrics like P/E. It's reported per fiscal year (unlike instantaneous
  // CommonStockSharesOutstanding which is point-in-time and doesn't show up
  // for many filers including META). Fall through to other concepts in
  // priority order.
  const sharesUnit = annualValues(
    pickConcept(
      facts,
      [
        'WeightedAverageNumberOfDilutedSharesOutstanding',
        'WeightedAverageNumberOfSharesOutstandingBasic',
        'CommonStockSharesOutstanding',
        'EntityCommonStockSharesOutstanding',
      ],
      'shares',
    ),
  );
  const longTermDebt = annualValues(
    pickConcept(facts, ['LongTermDebtNoncurrent', 'LongTermDebt']),
  );
  const equity = annualValues(
    pickConcept(facts, ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest']),
  );

  const byYear = new Map<number, Partial<AnnualRow>>();
  const set = (vals: SecFactValue[], field: keyof AnnualRow) => {
    for (const v of vals) {
      if (!v.fy) continue;
      const cur = byYear.get(v.fy) ?? { year: v.fy };
      (cur as Record<string, number>)[field] = v.val;
      byYear.set(v.fy, cur);
    }
  };
  set(revenue, 'revenue');
  set(ebit, 'ebit');
  set(netIncome, 'netIncome');
  set(sharesUnit, 'sharesOutstanding');

  for (const v of cfo) {
    if (!v.fy) continue;
    const cur = byYear.get(v.fy) ?? { year: v.fy };
    cur.fcf = (cur.fcf ?? 0) + v.val;
    byYear.set(v.fy, cur);
  }
  for (const v of capex) {
    if (!v.fy) continue;
    const cur = byYear.get(v.fy) ?? { year: v.fy };
    cur.fcf = (cur.fcf ?? 0) - Math.abs(v.val);
    byYear.set(v.fy, cur);
  }

  const debtByYear = new Map<number, number>();
  for (const v of longTermDebt) {
    if (v.fy) debtByYear.set(v.fy, v.val);
  }
  const equityByYear = new Map<number, number>();
  for (const v of equity) {
    if (v.fy) equityByYear.set(v.fy, v.val);
  }

  const rows: AnnualRow[] = [];
  for (const [year, cur] of byYear.entries()) {
    if (cur.revenue === undefined && cur.ebit === undefined) continue;
    const debt = debtByYear.get(year);
    const eq = equityByYear.get(year);
    const debtToEquity = debt !== undefined && eq && eq > 0 ? debt / eq : null;
    rows.push({
      year,
      revenue: cur.revenue ?? 0,
      ebit: cur.ebit ?? 0,
      netIncome: cur.netIncome ?? 0,
      fcf: cur.fcf ?? 0,
      sharesOutstanding: cur.sharesOutstanding ?? 0,
      longTermDebt: debt ?? null,
      roic: null,
      debtToEquity,
    });
  }
  rows.sort((a, b) => a.year - b.year);
  return rows.slice(-10);
}

type YahooQuote = {
  price?: { regularMarketPrice?: number | null };
  summaryDetail?: {
    trailingPE?: number | null;
    marketCap?: number | null;
    dividendYield?: number | null;
  };
  defaultKeyStatistics?: {
    enterpriseValue?: number | null;
    enterpriseToRevenue?: number | null;
    enterpriseToEbitda?: number | null;
  };
  financialData?: {
    totalCash?: number | null;
    totalDebt?: number | null;
    freeCashflow?: number | null;
    operatingCashflow?: number | null;
  };
};

async function fetchYahoo(ticker: string): Promise<YahooQuote | null> {
  try {
    const summary = (await yahooFinance.quoteSummary(ticker, {
      modules: ['summaryDetail', 'financialData', 'defaultKeyStatistics', 'price'],
    })) as YahooQuote;
    return summary;
  } catch {
    return null;
  }
}

// Year-end close prices for the past `years` years. Returns the last close
// of each calendar year that has data. Used to build historical valuation
// multiples (P/E and EV/EBIT) joined with SEC annual rows.
//
// We use yahoo's `chart()` (the v3-replacement for the deprecated
// `historical()`) with monthly intervals — sufficient resolution for
// year-end snapshots, fewer round trips than daily.
export async function fetchHistoricalYearEndCloses(
  ticker: string,
  years = 10,
): Promise<{ year: number; date: string; close: number }[]> {
  const now = new Date();
  const start = new Date(now.getUTCFullYear() - years - 1, 0, 1);
  try {
    const result = await yahooFinance.chart(ticker, {
      period1: start,
      period2: now,
      interval: '1mo',
    });
    const quotes = (result.quotes ?? []) as Array<{ date?: Date; close?: number | null }>;
    const yearEnds = new Map<number, { date: Date; close: number }>();
    for (const q of quotes) {
      if (!q.date || q.close == null) continue;
      const y = q.date.getUTCFullYear();
      // Always overwrite — we want the *last* monthly close for each year.
      yearEnds.set(y, { date: q.date, close: q.close });
    }
    const sorted = [...yearEnds.entries()].sort((a, b) => a[0] - b[0]);
    return sorted.map(([year, v]) => ({
      year,
      date: v.date.toISOString().slice(0, 10),
      close: v.close,
    }));
  } catch {
    return [];
  }
}

// Compute trailing-10y P/E and EV/EBIT medians by joining year-end closes
// with the SEC AnnualRow time series. Returns null medians when fewer than
// 5 years of paired data are available — a 3-year median isn't a "10y
// median" in any meaningful sense and would be misleading.
export function computeHistoricalMultiples(
  annual: AnnualRow[],
  closes: { year: number; close: number }[],
): { peRatio10yMedian: number | null; evEbit10yMedian: number | null; pairedYears: number } {
  const closeByYear = new Map<number, number>();
  for (const c of closes) closeByYear.set(c.year, c.close);
  const peValues: number[] = [];
  const evEbitValues: number[] = [];
  let paired = 0;
  for (const row of annual) {
    const close = closeByYear.get(row.year);
    if (close == null) continue;
    paired++;
    // P/E: close / EPS. EPS = netIncome / sharesOutstanding.
    if (row.netIncome > 0 && row.sharesOutstanding > 0) {
      const eps = row.netIncome / row.sharesOutstanding;
      const pe = close / eps;
      // Filter pathological values (negative earnings flipped to large positive,
      // or PE > 200 which is essentially zero earnings). These corrupt medians.
      if (pe > 0 && pe < 200) peValues.push(pe);
    }
    // EV/EBIT: (market cap + long-term debt) / EBIT.
    // Market cap = close * shares. We use longTermDebt as a proxy for net debt;
    // we don't have historical cash, so this is slightly understated for
    // cash-heavy filers but the year-over-year comparisons are still sensible.
    if (row.ebit > 0 && row.sharesOutstanding > 0) {
      const marketCap = close * row.sharesOutstanding;
      const ev = marketCap + (row.longTermDebt ?? 0);
      const evEbit = ev / row.ebit;
      if (evEbit > 0 && evEbit < 100) evEbitValues.push(evEbit);
    }
  }
  const median = (vs: number[]): number | null => {
    if (vs.length < 5) return null;
    const sorted = [...vs].sort((a, b) => a - b);
    const mid = sorted.length >>> 1;
    return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
  };
  return {
    peRatio10yMedian: median(peValues),
    evEbit10yMedian: median(evEbitValues),
    pairedYears: paired,
  };
}

export async function fetchFinancialSnapshot(
  ticker: string,
): Promise<FinancialSnapshot | null> {
  const upper = ticker.toUpperCase();
  const yahoo = await fetchYahoo(upper);
  if (!yahoo) return null;

  const price = yahoo.price?.regularMarketPrice ?? null;
  const marketCap = yahoo.summaryDetail?.marketCap ?? null;
  if (price == null || marketCap == null) return null;

  const ev = yahoo.defaultKeyStatistics?.enterpriseValue ?? marketCap;
  const totalCash = yahoo.financialData?.totalCash ?? 0;
  const totalDebt = yahoo.financialData?.totalDebt ?? 0;
  const netCash = totalCash - totalDebt;
  const fcf = yahoo.financialData?.freeCashflow ?? null;

  // Try SEC EDGAR for annual history.
  let annual: AnnualRow[] = [];
  try {
    const tickerMap = await loadTickerToCik();
    const cik = tickerMap.get(upper);
    if (cik) {
      const facts = await fetchCompanyFacts(cik);
      if (facts) annual = buildAnnualRows(facts);
    }
  } catch {
    // SEC unavailable — proceed with empty annual history.
  }

  const trend = computeShareCountTrend(annual);
  const isProfitable = annual.length > 0 ? annual[annual.length - 1]!.netIncome > 0 : false;
  const hasPositiveFcf = annual.length > 0 ? annual[annual.length - 1]!.fcf > 0 : (fcf ?? 0) > 0;

  const lastEbit = annual.length ? annual[annual.length - 1]!.ebit : 0;
  const evEbit = lastEbit > 0 ? ev / lastEbit : null;
  const lastRevenue = annual.length ? annual[annual.length - 1]!.revenue : 0;
  const evSales = lastRevenue > 0 ? ev / lastRevenue : null;
  const fcfYield = fcf && marketCap > 0 ? fcf / marketCap : null;

  // Historical valuation medians: pull year-end closes from Yahoo, join with
  // SEC annual rows, compute trailing P/E and EV/EBIT per year, take medians.
  // Best-effort — when Yahoo is unavailable or shares/EBIT history is sparse,
  // medians remain null. The downstream consumer (primary-source checklist
  // valuation reasoning, reverse DCF) treats null as "no historical context
  // available; reason from absolute multiples only."
  let peRatio10yMedian: number | null = null;
  let evEbit10yMedian: number | null = null;
  if (annual.length >= 5) {
    const closes = await fetchHistoricalYearEndCloses(upper, 10);
    const meds = computeHistoricalMultiples(annual, closes);
    peRatio10yMedian = meds.peRatio10yMedian;
    evEbit10yMedian = meds.evEbit10yMedian;
  }

  return {
    ticker: upper,
    asOf: new Date().toISOString().slice(0, 10),
    price,
    marketCap,
    enterpriseValue: ev,
    netCash,
    peRatio: yahoo.summaryDetail?.trailingPE ?? null,
    evEbit,
    evSales,
    fcfYield,
    peRatio10yMedian,
    evEbit10yMedian,
    annual,
    isProfitable,
    hasPositiveFcf,
    shareCountTrend: trend,
  };
}

export async function fetchPeerSnapshots(peers: string[]): Promise<FinancialSnapshot[]> {
  const results = await Promise.allSettled(peers.map((p) => fetchFinancialSnapshot(p)));
  const snaps: FinancialSnapshot[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) snaps.push(r.value);
  }
  return snaps;
}

export { median };
