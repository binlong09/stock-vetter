/**
 * "Valuation anomaly" detection: when the reverse-DCF central implied 10-year
 * FCF CAGR is far from the company's actual recent (5-year) FCF CAGR, the
 * market is pricing in something very different from what the business has
 * delivered. We surface this regardless of the composite score — a stock can
 * sit at "Watchlist" while embedding a decade of FCF decline (ADBE) or
 * acceleration. Threshold: |implied − actual| > 10 percentage points. Null
 * inputs (no reverse DCF, or no 5-yr actual) → no flag.
 */

const THRESHOLD_PP = 10;

export interface ValuationGap {
  /** implied minus actual, in percentage points (e.g. -16.5 for ADBE). */
  gapPp: number;
  impliedCagr: number;
  actualCagr: number;
  /** "pricing in much less than delivered" vs "...much more...". */
  direction: 'below' | 'above';
}

export function valuationGap(
  impliedCagr: number | null | undefined,
  actualCagr: number | null | undefined,
): ValuationGap | null {
  if (impliedCagr == null || actualCagr == null) return null;
  const gapPp = (impliedCagr - actualCagr) * 100;
  if (Math.abs(gapPp) <= THRESHOLD_PP) return null;
  return {
    gapPp,
    impliedCagr,
    actualCagr,
    direction: gapPp < 0 ? 'below' : 'above',
  };
}
