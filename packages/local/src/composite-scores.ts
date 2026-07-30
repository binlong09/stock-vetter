// Beneish M-score and Altman Z-score.
//
// Two published, peer-reviewed composites that this pipeline can compute for
// free because the XBRL series is already assembled. Both are annual by
// definition and both compare a year against its predecessor.
//
// WHY BOTHER, given the trend detectors above. Because these are *calibrated*.
// The trend detectors say "this got worse"; the thresholds here were fitted
// against known outcomes — Beneish (1999) against SEC AAER enforcement targets,
// Altman (1968, and the 1993 Z'' revision) against companies that actually went
// bankrupt. That makes them a sanity check on the rest of the pipeline rather
// than another opinion.
//
// WHAT THEY ARE NOT. Neither is a verdict. The M-score's own paper reports it
// correctly classifies about 76% of manipulators at a ~17.5% false-positive
// rate, which at 2,000 companies means roughly 350 false alarms a year if you
// treat it as an answer. Both are emitted with their component breakdown so a
// reader can see WHICH index drove the score — an M-score pushed entirely by
// SGI (sales growth) says "this is a fast-growing company", not "this is a
// fraud", and that distinction is invisible in the headline number.

import type { AnnualFundamentals } from './ratios.js';

export type IndexBreakdown = { name: string; value: number | null; note: string };

export type BeneishResult = {
  period: string;
  mScore: number | null;
  /** Beneish's own threshold. Above it, the model classifies as a manipulator. */
  threshold: -1.78;
  flagged: boolean;
  indices: IndexBreakdown[];
  /** Indices that couldn't be computed; each missing one biases the score. */
  missing: string[];
  /** The single largest positive contributor — what is actually driving it. */
  dominantIndex: string | null;
};

function ratio(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null || b === 0 || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  const r = a / b;
  return Number.isFinite(r) ? r : null;
}

function safeDiv(a: number | null, b: number | null): number | null {
  return ratio(a, b);
}

/**
 * Beneish M-score for the latest year in `annual`, against the prior year.
 *
 * Missing indices default to 1.0 (the neutral "no change" value) rather than
 * aborting, because most filers are missing at least one input — but each
 * substitution is recorded in `missing`, and a score resting on three
 * substituted indices should not be read as a measurement.
 */
export function beneishMScore(annual: AnnualFundamentals[]): BeneishResult | null {
  if (annual.length < 2) return null;
  const t = annual.at(-1)!;
  const p = annual.at(-2)!;

  const missing: string[] = [];
  const indices: IndexBreakdown[] = [];

  const push = (name: string, value: number | null, note: string): number => {
    indices.push({ name, value, note });
    if (value == null) {
      missing.push(name);
      return 1; // neutral
    }
    return value;
  };

  // DSRI — receivables growing faster than sales. The classic revenue-quality
  // index and usually the most diagnostic one.
  const dsri = push(
    'DSRI',
    safeDiv(ratio(t.accountsReceivable, t.revenue), ratio(p.accountsReceivable, p.revenue)),
    'Days sales in receivables index — >1 means receivables outgrew sales',
  );

  // GMI — deteriorating gross margin. Inverted: prior over current.
  // Inverted by construction: prior margin over current, so deterioration
  // pushes the index above 1.
  const gmi = push(
    'GMI',
    safeDiv(ratio(p.grossProfit, p.revenue), ratio(t.grossProfit, t.revenue)),
    'Gross margin index — >1 means margin deteriorated',
  );

  // AQI — a rising share of assets that are neither current nor PP&E, i.e.
  // soft assets. Capitalizing costs shows up here.
  const softT = t.totalAssets != null ? 1 - ((t.currentAssets ?? 0) + (t.ppeNet ?? 0)) / t.totalAssets : null;
  const softP = p.totalAssets != null ? 1 - ((p.currentAssets ?? 0) + (p.ppeNet ?? 0)) / p.totalAssets : null;
  const aqi = push('AQI', safeDiv(softT, softP), 'Asset quality index — >1 means more soft assets');

  const sgi = push('SGI', safeDiv(t.revenue, p.revenue), 'Sales growth index — growth alone, not misconduct');

  // DEPI — a falling depreciation rate, i.e. useful lives being extended.
  const depRateT = ratio(
    t.depreciationAmortization,
    t.depreciationAmortization != null && t.ppeNet != null ? t.depreciationAmortization + t.ppeNet : null,
  );
  const depRateP = ratio(
    p.depreciationAmortization,
    p.depreciationAmortization != null && p.ppeNet != null ? p.depreciationAmortization + p.ppeNet : null,
  );
  const depi = push('DEPI', safeDiv(depRateP, depRateT), 'Depreciation index — >1 means assets are being depreciated more slowly');

  const sgai = push(
    'SGAI',
    safeDiv(ratio(t.sga, t.revenue), ratio(p.sga, p.revenue)),
    'SG&A index — >1 means overhead grew faster than sales',
  );

  const levT = t.totalAssets != null ? ((t.currentLiabilities ?? 0) + (t.longTermDebt ?? 0)) / t.totalAssets : null;
  const levP = p.totalAssets != null ? ((p.currentLiabilities ?? 0) + (p.longTermDebt ?? 0)) / p.totalAssets : null;
  const lvgi = push('LVGI', safeDiv(levT, levP), 'Leverage index — >1 means leverage increased');

  // TATA — total accruals to total assets. Not an index; enters raw, and it
  // carries by far the largest coefficient in the model.
  const tataRaw =
    t.incomeContinuingOps != null && t.cfo != null && t.totalAssets
      ? (t.incomeContinuingOps - t.cfo) / t.totalAssets
      : null;
  indices.push({
    name: 'TATA',
    value: tataRaw,
    note: 'Total accruals to total assets — the heaviest-weighted term in the model',
  });
  const tata = tataRaw ?? 0;
  if (tataRaw == null) missing.push('TATA');

  const mScore =
    -4.84 +
    0.92 * dsri +
    0.528 * gmi +
    0.404 * aqi +
    0.892 * sgi +
    0.115 * depi -
    0.172 * sgai +
    4.679 * tata -
    0.327 * lvgi;

  // Which index is actually driving the score. An M-score pushed entirely by
  // SGI describes a fast-growing company, not a fraudulent one, and reporting
  // only the headline hides that completely.
  const contributions: Array<[string, number]> = [
    ['DSRI', 0.92 * (dsri - 1)],
    ['GMI', 0.528 * (gmi - 1)],
    ['AQI', 0.404 * (aqi - 1)],
    ['SGI', 0.892 * (sgi - 1)],
    ['DEPI', 0.115 * (depi - 1)],
    ['SGAI', -0.172 * (sgai - 1)],
    ['TATA', 4.679 * tata],
    ['LVGI', -0.327 * (lvgi - 1)],
  ];
  contributions.sort((a, b) => b[1] - a[1]);
  const dominantIndex = contributions[0] && contributions[0][1] > 0 ? contributions[0][0] : null;

  return {
    period: t.period,
    mScore: Number.isFinite(mScore) ? Number(mScore.toFixed(3)) : null,
    threshold: -1.78,
    flagged: Number.isFinite(mScore) && mScore > -1.78,
    indices,
    missing,
    dominantIndex,
  };
}

export type AltmanResult = {
  period: string;
  zScore: number | null;
  /** Z'' (1993), the non-manufacturer variant — needs no market cap. */
  variant: 'Z-double-prime';
  /** Below this, the model puts the company in the distress zone. */
  distressThreshold: 1.1;
  safeThreshold: 2.6;
  zone: 'distress' | 'grey' | 'safe' | 'unknown';
  components: IndexBreakdown[];
  missing: string[];
};

/**
 * Altman Z''-score.
 *
 * The 1993 four-variable revision, not the original 1968 Z. Original Z needs
 * market capitalization and was fitted on public manufacturers; Z'' uses book
 * equity and was fitted to work across industries. Since the input here is
 * XBRL and not a price feed, Z'' is both the more accurate choice and the one
 * that doesn't drag a market-data dependency into a filing-analysis pipeline.
 */
export function altmanZScore(annual: AnnualFundamentals[]): AltmanResult | null {
  if (!annual.length) return null;
  const t = annual.at(-1)!;
  const ta = t.totalAssets;
  const missing: string[] = [];

  const wc = t.currentAssets != null && t.currentLiabilities != null ? t.currentAssets - t.currentLiabilities : null;
  const x1 = ratio(wc, ta);
  const x2 = ratio(t.retainedEarnings, ta);
  const x3 = ratio(t.operatingIncome, ta);
  const x4 = ratio(t.equity, t.totalLiabilities);

  const components: IndexBreakdown[] = [
    { name: 'X1 working capital / assets', value: x1, note: 'Short-term liquidity cushion' },
    { name: 'X2 retained earnings / assets', value: x2, note: 'Cumulative profitability and age' },
    { name: 'X3 EBIT / assets', value: x3, note: 'Operating productivity of the asset base' },
    { name: 'X4 equity / liabilities', value: x4, note: 'Solvency buffer' },
  ];
  for (const c of components) if (c.value == null) missing.push(c.name);

  // Missing an input is not the same as it being zero — a company with no
  // retained-earnings tag is not a company with no retained earnings — so a
  // score is only produced when every term is present.
  if (x1 == null || x2 == null || x3 == null || x4 == null) {
    return {
      period: t.period,
      zScore: null,
      variant: 'Z-double-prime',
      distressThreshold: 1.1,
      safeThreshold: 2.6,
      zone: 'unknown',
      components,
      missing,
    };
  }

  const z = 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4;
  return {
    period: t.period,
    zScore: Number(z.toFixed(2)),
    variant: 'Z-double-prime',
    distressThreshold: 1.1,
    safeThreshold: 2.6,
    zone: z < 1.1 ? 'distress' : z > 2.6 ? 'safe' : 'grey',
    components,
    missing,
  };
}

export function renderCompositeScores(m: BeneishResult | null, z: AltmanResult | null): string[] {
  const lines: string[] = [];
  if (m?.mScore != null) {
    lines.push(
      `Beneish M-score ${m.mScore} (threshold ${m.threshold}, ${m.flagged ? 'FLAGGED' : 'not flagged'})` +
        (m.dominantIndex ? ` — driven mainly by ${m.dominantIndex}` : '') +
        (m.missing.length ? ` — ${m.missing.length} index/indices unavailable (${m.missing.join(', ')})` : ''),
    );
  }
  if (z?.zScore != null) {
    lines.push(`Altman Z''-score ${z.zScore} — ${z.zone} zone (distress below ${z.distressThreshold})`);
  } else if (z) {
    lines.push(`Altman Z''-score unavailable — missing ${z.missing.join(', ')}`);
  }
  return lines;
}
