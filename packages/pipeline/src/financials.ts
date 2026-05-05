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
  const ns = facts.facts?.['us-gaap'] ?? facts.facts?.ifrs ?? {};
  for (const name of candidates) {
    const concept = ns[name];
    const units = concept?.units?.[unit];
    if (units && units.length) return units;
  }
  return [];
}

function annualValues(values: SecFactValue[]): SecFactValue[] {
  // Annual = full-year (FY, fp=FY) entries, prefer 10-K.
  const byYear = new Map<number, SecFactValue>();
  for (const v of values) {
    if (v.fp !== 'FY') continue;
    if (!v.fy) continue;
    const existing = byYear.get(v.fy);
    if (!existing) {
      byYear.set(v.fy, v);
      continue;
    }
    // Prefer 10-K over 10-K/A over others
    const rank = (form?: string) =>
      form === '10-K' ? 3 : form === '10-K/A' ? 2 : form === '20-F' ? 2 : 1;
    if (rank(v.form) > rank(existing.form)) byYear.set(v.fy, v);
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
  const sharesUnit = annualValues(
    pickConcept(facts, ['CommonStockSharesOutstanding', 'EntityCommonStockSharesOutstanding'], 'shares'),
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

  // EV/EBIT and historical medians require historical EV time-series, which
  // is non-trivial. Best-effort: if we have annual EBIT and current EV, use
  // most-recent EBIT for current EV/EBIT; leave 10-yr medians null for v1.
  const lastEbit = annual.length ? annual[annual.length - 1]!.ebit : 0;
  const evEbit = lastEbit > 0 ? ev / lastEbit : null;
  const lastRevenue = annual.length ? annual[annual.length - 1]!.revenue : 0;
  const evSales = lastRevenue > 0 ? ev / lastRevenue : null;
  const fcfYield = fcf && marketCap > 0 ? fcf / marketCap : null;

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
    peRatio10yMedian: null,
    evEbit10yMedian: null,
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
