// Per-period forensic ratios, computed from the XBRL series.
//
// Everything here is arithmetic on filer-tagged numbers. No model is involved,
// which means a finding built on these is exact in a way nothing extracted
// from filing text can be — worth saying explicitly downstream, because the
// cloud model should weight "DSO went from 61 to 78 days" (computed) very
// differently from "the local model read a sentence saying DSO rose"
// (transcribed).
//
// SEASONALITY IS THE TRAP. A retailer's inventory always spikes in Q3 and
// always falls in Q1, and a detector comparing sequential quarters will report
// that as a finding every single year for every single retailer. So the
// comparison basis throughout is YEAR-OVER-YEAR: Q3 2025 against Q3 2024.
// Sequential change is computed too, but only ever reported as context.

import {
  recentQuarters,
  recentYears,
  type ConceptSeries,
  type FactPoint,
  type SeriesSet,
} from '@stock-vetter/core';

export type PeriodRatios = {
  period: string; // "2025Q3"
  fy: number;
  fp: string;
  end: string;
  /** Days in the period, from the duration fact. Drives the days-based ratios. */
  days: number;

  revenue: number | null;
  costOfRevenue: number | null;
  grossMargin: number | null; // 0..1
  operatingMargin: number | null;
  netIncome: number | null;
  cfo: number | null;

  accountsReceivable: number | null;
  inventory: number | null;
  accountsPayable: number | null;
  totalAssets: number | null;

  /** Days sales outstanding: AR / revenue × days. */
  dso: number | null;
  /** Days inventory outstanding: inventory / COGS × days. */
  dio: number | null;
  /** Days payable outstanding: AP / COGS × days. */
  dpo: number | null;
  /** Cash conversion cycle: DSO + DIO − DPO. */
  ccc: number | null;

  /** CFO / net income. Below 1 sustained means earnings aren't converting. */
  cfoToNetIncome: number | null;
  /** Sloan accrual ratio: (net income − CFO) / total assets. */
  accrualRatio: number | null;

  sgaToRevenue: number | null;
  capexToDepreciation: number | null;
  dilutedShares: number | null;
  netDebt: number | null;
  netDebtToAssets: number | null;
  goodwillToAssets: number | null;
  deferredRevenue: number | null;

  /** Any concept whose value for this period was restated by a later filing. */
  restatedConcepts: string[];
};

function pt(series: ConceptSeries | undefined, period: string, asOf?: string): FactPoint | null {
  if (!series) return null;
  const p = series.quarterly.find((x) => x.period === period);
  if (!p) return null;
  if (asOf && p.end > asOf) return null;
  return p;
}

function ptAnnual(series: ConceptSeries | undefined, period: string, asOf?: string): FactPoint | null {
  if (!series) return null;
  const p = series.annual.find((x) => x.period === period);
  if (!p) return null;
  if (asOf && p.end > asOf) return null;
  return p;
}

function div(a: number | null, b: number | null): number | null {
  if (a == null || b == null || b === 0 || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  return a / b;
}

function daysBetween(start: string | null, end: string): number {
  if (!start) return 91.25;
  const d = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000);
  return Number.isFinite(d) && d > 0 ? d : 91.25;
}

export type RatioOptions = {
  /** Ignore any fact ending after this date. Prevents look-ahead bias. */
  asOf?: string;
  /** How many quarters back to compute. Default 13 (three years plus one). */
  quarters?: number;
};

/**
 * Build the per-quarter ratio series.
 *
 * Balance-sheet items are point-in-time and income items are flows, so a
 * days-based ratio properly wants an AVERAGE balance over the period. Using
 * the period-end balance instead is the market convention and is what a
 * reader comparing to a screen will expect, so that is what this does — but
 * it means a large acquisition closing near period end inflates DSO for one
 * quarter. `detectTrends` requires several consecutive quarters before
 * reporting, which is largely why.
 */
export function computeRatios(set: SeriesSet, opts: RatioOptions = {}): PeriodRatios[] {
  const g = (name: string): ConceptSeries | undefined => set.byConcept.get(name);
  const n = opts.quarters ?? 13;

  // The revenue series defines which periods exist; every other concept is
  // looked up against it. Without a revenue series there are no ratios worth
  // computing.
  const revenuePoints = recentQuarters(g('revenue'), n, opts.asOf);
  const out: PeriodRatios[] = [];

  for (const rev of revenuePoints) {
    const period = rev.period;
    const days = daysBetween(rev.start, rev.end);
    const asOf = opts.asOf;

    const cogs = pt(g('costOfRevenue'), period, asOf)?.value ?? null;
    const grossProfitReported = pt(g('grossProfit'), period, asOf)?.value ?? null;
    const grossProfit = grossProfitReported ?? (cogs != null ? rev.value - cogs : null);
    const opInc = pt(g('operatingIncome'), period, asOf)?.value ?? null;
    const ni = pt(g('netIncome'), period, asOf)?.value ?? null;
    const cfo = pt(g('cfo'), period, asOf)?.value ?? null;
    const sga = pt(g('sga'), period, asOf)?.value ?? null;
    const capex = pt(g('capex'), period, asOf)?.value ?? null;
    const da = pt(g('depreciationAmortization'), period, asOf)?.value ?? null;

    const ar = pt(g('accountsReceivable'), period, asOf)?.value ?? null;
    const inv = pt(g('inventory'), period, asOf)?.value ?? null;
    const ap = pt(g('accountsPayable'), period, asOf)?.value ?? null;
    const ta = pt(g('totalAssets'), period, asOf)?.value ?? null;
    const goodwill = pt(g('goodwill'), period, asOf)?.value ?? null;
    const cash = pt(g('cash'), period, asOf)?.value ?? null;
    const ltd = pt(g('longTermDebt'), period, asOf)?.value ?? null;
    const std = pt(g('shortTermDebt'), period, asOf)?.value ?? null;
    const dr = pt(g('deferredRevenue'), period, asOf)?.value ?? null;
    const shares = pt(g('dilutedShares'), period, asOf)?.value ?? null;

    const dso = ar != null && rev.value > 0 ? (ar / rev.value) * days : null;
    const dio = inv != null && cogs != null && cogs > 0 ? (inv / cogs) * days : null;
    const dpo = ap != null && cogs != null && cogs > 0 ? (ap / cogs) * days : null;

    const totalDebt = (ltd ?? 0) + (std ?? 0);
    const hasDebt = ltd != null || std != null;
    const netDebt = hasDebt ? totalDebt - (cash ?? 0) : null;

    const restatedConcepts: string[] = [];
    for (const [name, series] of set.byConcept) {
      const p = series.quarterly.find((x) => x.period === period);
      if (p?.restatedFrom !== undefined) restatedConcepts.push(name);
    }

    out.push({
      period,
      fy: rev.fy,
      fp: rev.fp,
      end: rev.end,
      days,
      revenue: rev.value,
      costOfRevenue: cogs,
      grossMargin: div(grossProfit, rev.value),
      operatingMargin: div(opInc, rev.value),
      netIncome: ni,
      cfo,
      accountsReceivable: ar,
      inventory: inv,
      accountsPayable: ap,
      totalAssets: ta,
      dso,
      dio,
      dpo,
      ccc: dso != null && dio != null && dpo != null ? dso + dio - dpo : null,
      cfoToNetIncome: ni != null && ni > 0 ? div(cfo, ni) : null,
      accrualRatio: ni != null && cfo != null ? div(ni - cfo, ta) : null,
      sgaToRevenue: div(sga, rev.value),
      capexToDepreciation: div(capex, da),
      dilutedShares: shares,
      netDebt,
      netDebtToAssets: div(netDebt, ta),
      goodwillToAssets: div(goodwill, ta),
      deferredRevenue: dr,
      restatedConcepts,
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Annual ratios — for the composite scores, which are defined annually
// ---------------------------------------------------------------------------

export type AnnualFundamentals = {
  period: string;
  fy: number;
  end: string;
  revenue: number | null;
  costOfRevenue: number | null;
  grossProfit: number | null;
  sga: number | null;
  netIncome: number | null;
  incomeContinuingOps: number | null;
  cfo: number | null;
  depreciationAmortization: number | null;
  accountsReceivable: number | null;
  currentAssets: number | null;
  currentLiabilities: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  equity: number | null;
  retainedEarnings: number | null;
  ppeNet: number | null;
  longTermDebt: number | null;
  operatingIncome: number | null;
};

export function computeAnnualFundamentals(set: SeriesSet, opts: RatioOptions = {}): AnnualFundamentals[] {
  const g = (name: string): ConceptSeries | undefined => set.byConcept.get(name);
  const years = recentYears(g('revenue'), opts.quarters ?? 6, opts.asOf);
  const asOf = opts.asOf;

  return years.map((rev) => {
    const period = rev.period;
    const cogs = ptAnnual(g('costOfRevenue'), period, asOf)?.value ?? null;
    const reportedGross = ptAnnual(g('grossProfit'), period, asOf)?.value ?? null;
    // Balance-sheet concepts are instants; their FY point is the year-end
    // balance, which is what every one of these ratios wants.
    const inst = (name: string): number | null => ptAnnual(g(name), period, asOf)?.value ?? null;
    return {
      period,
      fy: rev.fy,
      end: rev.end,
      revenue: rev.value,
      costOfRevenue: cogs,
      grossProfit: reportedGross ?? (cogs != null ? rev.value - cogs : null),
      sga: ptAnnual(g('sga'), period, asOf)?.value ?? null,
      netIncome: ptAnnual(g('netIncome'), period, asOf)?.value ?? null,
      incomeContinuingOps:
        ptAnnual(g('incomeContinuingOps'), period, asOf)?.value ??
        ptAnnual(g('netIncome'), period, asOf)?.value ??
        null,
      cfo: ptAnnual(g('cfo'), period, asOf)?.value ?? null,
      depreciationAmortization: ptAnnual(g('depreciationAmortization'), period, asOf)?.value ?? null,
      operatingIncome: ptAnnual(g('operatingIncome'), period, asOf)?.value ?? null,
      accountsReceivable: inst('accountsReceivable'),
      currentAssets: inst('currentAssets'),
      currentLiabilities: inst('currentLiabilities'),
      totalAssets: inst('totalAssets'),
      totalLiabilities: inst('totalLiabilities'),
      equity: inst('equity'),
      retainedEarnings: inst('retainedEarnings'),
      ppeNet: inst('ppeNet'),
      longTermDebt: inst('longTermDebt'),
    };
  });
}
