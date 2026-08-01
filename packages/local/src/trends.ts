// Cross-filing trend detection.
//
// This is where the actual short signals are. A single filing showing
// receivables up 22% is a quarter; receivables outgrowing revenue for six
// consecutive quarters while DSO lengthens 17 days is a thesis. Nothing in the
// per-filing pipeline can see that, because it only ever looks at one filing.
//
// Two rules govern every detector here:
//
//  1. COMPARE YEAR OVER YEAR, NEVER SEQUENTIALLY. A retailer's inventory
//     always spikes into the holiday quarter and always drains after it. A
//     sequential detector reports that as a finding every year for every
//     retailer, which is worse than useless — it trains you to ignore the
//     output. Q3 2025 is compared against Q3 2024.
//
//  2. REQUIRE A RUN. One bad quarter is noise: a large acquisition closing
//     near period end inflates DSO once, an inventory build ahead of a launch
//     is deliberate. Detectors require several consecutive year-over-year
//     deteriorations before they say anything, which is what separates a trend
//     from a data point.
//
// Findings from this module are EXACT — arithmetic on numbers the filer tagged
// itself — and are marked as such so the cloud model can weight them above
// anything a 30B model transcribed from a page.

import type { FlagSeverity, FlagCategory, TrendChangeUnit, TrendFinding } from '@stock-vetter/schema';
import type { SeriesSet } from '@stock-vetter/core';
import { computeRatios, type PeriodRatios, type RatioOptions } from './ratios.js';

export type { TrendFinding } from '@stock-vetter/schema';

type ChangeUnit = TrendChangeUnit;

type Detector = {
  id: string;
  metric: string;
  category: FlagCategory;
  worseWhen: 'higher' | 'lower';
  changeUnit: ChangeUnit;
  /** Consecutive YoY deteriorations required before reporting. */
  minConsecutive: number;
  /** Total change from the run's start required before reporting. */
  minChange: number;
  get: (r: PeriodRatios) => number | null;
  /** Builds the claim sentence. */
  describe: (latest: number, yearAgo: number, change: number, consec: number) => string;
  /** Concepts whose tags are cited as the source. */
  concepts: string[];
};

const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;
const d1 = (n: number): string => n.toFixed(1);

// Change in the detector's natural unit. Percent for levels, absolute for
// things already expressed in days or as a rate — a gross margin going 44.7%
// → 43.7% is 100bps, and calling that "a 2.2% decline" both understates it and
// invites confusion with a 2.2-point decline.
function changeIn(unit: ChangeUnit, latest: number, base: number): number {
  switch (unit) {
    case 'days':
      return latest - base;
    case 'bps':
      return (latest - base) * 10_000;
    case 'ratio':
      return latest - base;
    case 'percent':
    default:
      return base === 0 ? 0 : (latest - base) / Math.abs(base);
  }
}

const DETECTORS: Detector[] = [
  {
    id: 'dso-lengthening',
    metric: 'dso',
    category: 'receivables',
    worseWhen: 'higher',
    changeUnit: 'days',
    minConsecutive: 3,
    minChange: 7,
    get: (r) => r.dso,
    concepts: ['accountsReceivable', 'revenue'],
    describe: (l, y, c, n) =>
      `Days sales outstanding lengthened to ${d1(l)} days from ${d1(y)} a year earlier ` +
      `(+${d1(c)} days), rising year-over-year for ${n} consecutive quarters`,
  },
  {
    id: 'dio-lengthening',
    metric: 'dio',
    category: 'inventory',
    worseWhen: 'higher',
    changeUnit: 'days',
    minConsecutive: 3,
    minChange: 10,
    get: (r) => r.dio,
    concepts: ['inventory', 'costOfRevenue'],
    describe: (l, y, c, n) =>
      `Days inventory outstanding lengthened to ${d1(l)} days from ${d1(y)} a year earlier ` +
      `(+${d1(c)} days), rising year-over-year for ${n} consecutive quarters`,
  },
  {
    id: 'dpo-lengthening',
    metric: 'dpo',
    category: 'liquidity',
    worseWhen: 'higher',
    changeUnit: 'days',
    minConsecutive: 3,
    minChange: 10,
    get: (r) => r.dpo,
    concepts: ['accountsPayable', 'costOfRevenue'],
    describe: (l, y, c, n) =>
      `Days payable outstanding lengthened to ${d1(l)} days from ${d1(y)} a year earlier ` +
      `(+${d1(c)} days) over ${n} consecutive quarters — the company is financing itself on its suppliers`,
  },
  {
    id: 'ccc-lengthening',
    metric: 'ccc',
    category: 'cash-conversion',
    worseWhen: 'higher',
    changeUnit: 'days',
    minConsecutive: 3,
    minChange: 12,
    get: (r) => r.ccc,
    concepts: ['accountsReceivable', 'inventory', 'accountsPayable', 'revenue', 'costOfRevenue'],
    describe: (l, y, c, n) =>
      `Cash conversion cycle lengthened to ${d1(l)} days from ${d1(y)} a year earlier ` +
      `(+${d1(c)} days) across ${n} consecutive quarters`,
  },
  {
    id: 'gross-margin-eroding',
    metric: 'grossMargin',
    category: 'margin',
    worseWhen: 'lower',
    changeUnit: 'bps',
    minConsecutive: 3,
    minChange: 150,
    get: (r) => r.grossMargin,
    concepts: ['grossProfit', 'revenue', 'costOfRevenue'],
    describe: (l, y, c, n) =>
      `Gross margin fell to ${pct(l)} from ${pct(y)} a year earlier (${d1(c)}bps), ` +
      `down year-over-year for ${n} consecutive quarters`,
  },
  {
    id: 'cfo-diverging-from-earnings',
    metric: 'cfoToNetIncome',
    category: 'cash-conversion',
    worseWhen: 'lower',
    changeUnit: 'ratio',
    minConsecutive: 3,
    minChange: 0.25,
    get: (r) => r.cfoToNetIncome,
    concepts: ['cfo', 'netIncome'],
    describe: (l, y, c, n) =>
      `Operating cash flow covered only ${l.toFixed(2)}× net income, down from ${y.toFixed(2)}× ` +
      `a year earlier, deteriorating for ${n} consecutive quarters — reported earnings are not converting to cash`,
  },
  {
    id: 'accruals-rising',
    metric: 'accrualRatio',
    category: 'cash-conversion',
    worseWhen: 'higher',
    changeUnit: 'bps',
    minConsecutive: 3,
    minChange: 200,
    get: (r) => r.accrualRatio,
    concepts: ['netIncome', 'cfo', 'totalAssets'],
    describe: (l, y, c, n) =>
      `Accrual ratio rose to ${pct(l)} of assets from ${pct(y)} a year earlier (+${d1(c)}bps) ` +
      `over ${n} consecutive quarters — a widening share of earnings is non-cash`,
  },
  {
    id: 'sga-deleveraging',
    metric: 'sgaToRevenue',
    category: 'margin',
    worseWhen: 'higher',
    changeUnit: 'bps',
    minConsecutive: 3,
    minChange: 150,
    get: (r) => r.sgaToRevenue,
    concepts: ['sga', 'revenue'],
    describe: (l, y, c, n) =>
      `SG&A rose to ${pct(l)} of revenue from ${pct(y)} a year earlier (+${d1(c)}bps) ` +
      `across ${n} consecutive quarters — operating leverage is running backwards`,
  },
  {
    id: 'share-count-growing',
    metric: 'dilutedShares',
    category: 'dilution',
    worseWhen: 'higher',
    changeUnit: 'percent',
    minConsecutive: 3,
    minChange: 0.04,
    get: (r) => r.dilutedShares,
    concepts: ['dilutedShares'],
    describe: (l, y, c, n) =>
      `Diluted share count grew ${pct(c)} year-over-year for ${n} consecutive quarters ` +
      `(${(l / 1e6).toFixed(1)}M vs ${(y / 1e6).toFixed(1)}M)`,
  },
  {
    id: 'leverage-rising',
    metric: 'netDebtToAssets',
    category: 'leverage-covenant',
    worseWhen: 'higher',
    changeUnit: 'bps',
    minConsecutive: 3,
    minChange: 400,
    get: (r) => r.netDebtToAssets,
    concepts: ['longTermDebt', 'shortTermDebt', 'cash', 'totalAssets'],
    describe: (l, y, c, n) =>
      `Net debt rose to ${pct(l)} of assets from ${pct(y)} a year earlier (+${d1(c)}bps) ` +
      `over ${n} consecutive quarters`,
  },
  {
    id: 'deferred-revenue-shrinking',
    metric: 'deferredRevenue',
    category: 'revenue-recognition',
    worseWhen: 'lower',
    changeUnit: 'percent',
    minConsecutive: 3,
    minChange: 0.08,
    get: (r) => r.deferredRevenue,
    concepts: ['deferredRevenue'],
    describe: (l, y, c, n) =>
      `Deferred revenue fell ${pct(Math.abs(c))} year-over-year for ${n} consecutive quarters — ` +
      `for a subscription or contract business this leads reported revenue down`,
  },
  {
    id: 'underinvesting',
    metric: 'capexToDepreciation',
    category: 'cost-capitalization',
    worseWhen: 'lower',
    changeUnit: 'ratio',
    minConsecutive: 4,
    minChange: 0.3,
    get: (r) => r.capexToDepreciation,
    concepts: ['capex', 'depreciationAmortization'],
    describe: (l, y, c, n) =>
      `Capex fell to ${l.toFixed(2)}× depreciation from ${y.toFixed(2)}× a year earlier, ` +
      `declining for ${n} consecutive quarters — current earnings may be borrowing from the asset base`,
  },
];

function severityFor(consec: number, change: number, minChange: number): FlagSeverity {
  const magnitude = Math.abs(change) / Math.abs(minChange);
  if (consec >= 5 || (consec >= 4 && magnitude >= 2)) return 'high';
  if (consec >= 4 || magnitude >= 2) return 'medium';
  return 'low';
}

// Pair each period with the same fiscal quarter one year earlier. Matching on
// (fy-1, fp) rather than "four rows back" is what makes this robust to a
// missing quarter — and a missing quarter is common, because Q4 only exists
// once the 10-K lands.
function yoyPairs(
  rows: PeriodRatios[],
  get: (r: PeriodRatios) => number | null,
): Array<{ period: string; latest: number; prior: number }> {
  const byPeriod = new Map(rows.map((r) => [r.period, r]));
  const out: Array<{ period: string; latest: number; prior: number }> = [];
  for (const r of rows) {
    const priorRow = byPeriod.get(`${r.fy - 1}${r.fp}`);
    if (!priorRow) continue;
    const latest = get(r);
    const prior = get(priorRow);
    if (latest == null || prior == null || !Number.isFinite(latest) || !Number.isFinite(prior)) continue;
    out.push({ period: r.period, latest, prior });
  }
  return out;
}

export type TrendOptions = RatioOptions & {
  /** Override the consecutive-period requirement for every detector. */
  minConsecutive?: number;
};

export type TrendResult = {
  findings: TrendFinding[];
  /** Quarters of ratio data available — few quarters means weak conclusions. */
  periodsAvailable: number;
  latestPeriod: string | null;
  /** Detectors that couldn't run because the filer doesn't tag their inputs. */
  unavailable: string[];
  warnings: string[];
};

/**
 * Run every detector over a company's XBRL series.
 *
 * `opts.asOf` must be set to the filing's period end when analyzing a
 * historical filing, or the trends will be computed with data that did not
 * exist when the filing was made.
 */
export function detectTrends(set: SeriesSet, opts: TrendOptions = {}): TrendResult {
  const rows = computeRatios(set, opts);
  const findings: TrendFinding[] = [];
  const unavailable: string[] = [];
  const warnings: string[] = [];

  if (rows.length < 5) {
    return {
      findings: [],
      periodsAvailable: rows.length,
      latestPeriod: rows.at(-1)?.period ?? null,
      unavailable: DETECTORS.map((d) => d.id),
      warnings: [
        `only ${rows.length} quarters of comparable data — at least 5 are needed for a single ` +
          `year-over-year comparison, and trends need more`,
      ],
    };
  }

  const restatedPeriods = new Set(rows.filter((r) => r.restatedConcepts.length).map((r) => r.period));

  for (const det of DETECTORS) {
    const minConsecutive = opts.minConsecutive ?? det.minConsecutive;
    const pairs = yoyPairs(rows, det.get);
    if (pairs.length < minConsecutive) {
      unavailable.push(det.id);
      continue;
    }

    // Walk backwards from the latest pair counting consecutive deteriorations.
    let consec = 0;
    for (let i = pairs.length - 1; i >= 0; i--) {
      const p = pairs[i]!;
      const worse = det.worseWhen === 'higher' ? p.latest > p.prior : p.latest < p.prior;
      if (!worse) break;
      consec++;
    }
    if (consec < minConsecutive) continue;

    const latestPair = pairs.at(-1)!;
    const change = changeIn(det.changeUnit, latestPair.latest, latestPair.prior);
    const exceeds =
      det.changeUnit === 'percent'
        ? Math.abs(change) >= det.minChange
        : Math.abs(change) >= det.minChange;
    if (!exceeds) continue;

    const series = pairs.slice(-Math.max(consec, 6)).map((p) => ({ period: p.period, value: p.latest }));
    const usesRestatedData = series.some((s) => restatedPeriods.has(s.period));

    const sourceTags = det.concepts.flatMap((c) => set.byConcept.get(c)?.matchedTags ?? []);

    findings.push({
      id: det.id,
      metric: det.metric,
      category: det.category,
      severity: severityFor(consec, change, det.minChange),
      claim: det.describe(latestPair.latest, latestPair.prior, change, consec),
      direction: 'deteriorating',
      consecutivePeriods: consec,
      latestPeriod: latestPair.period,
      latestValue: latestPair.latest,
      yearAgoValue: latestPair.prior,
      change,
      changeUnit: det.changeUnit,
      series,
      sourceTags: [...new Set(sourceTags)],
      usesRestatedData,
    });
  }

  // --- restatement detection ------------------------------------------------
  // Not a trend, but only visible across filings: a period whose value changed
  // between one filing and a later one. The company revised a number it had
  // already reported.
  const restated = rows.filter((r) => r.restatedConcepts.length > 0);
  if (restated.length) {
    const latest = restated.at(-1)!;
    findings.push({
      id: 'prior-period-restated',
      metric: 'restatement',
      category: 'accounting-estimate-change',
      severity: restated.length >= 3 ? 'high' : 'medium',
      claim:
        `${restated.length} prior period(s) were revised by a later filing — most recently ` +
        `${latest.period} (${latest.restatedConcepts.join(', ')}). The company changed figures it had already reported.`,
      direction: 'deteriorating',
      consecutivePeriods: restated.length,
      latestPeriod: latest.period,
      latestValue: restated.length,
      yearAgoValue: 0,
      change: restated.length,
      changeUnit: 'ratio',
      series: restated.map((r) => ({ period: r.period, value: r.restatedConcepts.length })),
      sourceTags: [...new Set(restated.flatMap((r) => r.restatedConcepts))],
      usesRestatedData: true,
    });
  }

  const missingConcepts = set.missing.length;
  if (missingConcepts > 0) {
    warnings.push(
      `${missingConcepts} concepts are untagged by this filer (${set.missing.join(', ')}) — ` +
        `the detectors depending on them could not run`,
    );
  }

  findings.sort(
    (a, b) =>
      ({ high: 2, medium: 1, low: 0 })[b.severity] - ({ high: 2, medium: 1, low: 0 })[a.severity] ||
      b.consecutivePeriods - a.consecutivePeriods,
  );

  return {
    findings,
    periodsAvailable: rows.length,
    latestPeriod: rows.at(-1)?.period ?? null,
    unavailable,
    warnings,
  };
}

/** All detector ids, for docs and for the CLI's explain output. */
export const TREND_DETECTOR_IDS = DETECTORS.map((d) => d.id);
