import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ConceptSeries, FactPoint, SeriesSet } from '@stock-vetter/core';
import {
  capTier,
  isSmallCap,
  resolveItemSeverity,
  indexOnlyFormDef,
  detectDilution,
  detectCashRunway,
  altmanIsNews,
} from './smallcap.js';
import type { AnnualFundamentals } from './ratios.js';

// --- fixtures --------------------------------------------------------------

function quarterly(concept: string, values: Array<[string, number]>): ConceptSeries {
  const quarters: FactPoint[] = values.map(([period, value]) => {
    const fy = Number(period.slice(0, 4));
    const q = Number(period.slice(5));
    const endMonth = q * 3;
    return {
      period,
      fy,
      fp: `Q${q}`,
      start: `${fy}-${String(endMonth - 2).padStart(2, '0')}-01`,
      end: `${fy}-${String(endMonth).padStart(2, '0')}-28`,
      value,
      form: '10-Q',
    } as FactPoint;
  });
  return { concept, matchedTags: [concept], kind: 'duration', unit: 'USD', quarterly: quarters, annual: [] };
}

function set(...series: ConceptSeries[]): SeriesSet {
  return {
    cik: '0000000001',
    entityName: 'Test Co',
    byConcept: new Map(series.map((s) => [s.concept, s])),
    missing: [],
  };
}

function year(fy: number, over: Partial<AnnualFundamentals> = {}): AnnualFundamentals {
  return {
    period: `${fy}FY`,
    fy,
    end: `${fy}-12-31`,
    revenue: 1000,
    costOfRevenue: 600,
    grossProfit: 400,
    sga: 200,
    netIncome: 100,
    incomeContinuingOps: 100,
    cfo: 110,
    depreciationAmortization: 50,
    accountsReceivable: 200,
    currentAssets: 800,
    currentLiabilities: 400,
    totalAssets: 2000,
    totalLiabilities: 900,
    equity: 1100,
    retainedEarnings: 600,
    ppeNet: 700,
    longTermDebt: 400,
    operatingIncome: 180,
    ...over,
  };
}

// A balance sheet that scores in the Altman distress zone: no working-capital
// cushion, a large accumulated deficit, operating losses, thin equity.
const DISTRESSED: Partial<AnnualFundamentals> = {
  currentAssets: 100,
  currentLiabilities: 500,
  retainedEarnings: -1500,
  operatingIncome: -300,
  equity: 50,
  totalLiabilities: 1900,
  totalAssets: 1950,
};

// --- cap tiers -------------------------------------------------------------

test('cap tiers bucket by market cap, and a missing cap is not a small cap', () => {
  assert.equal(capTier(20e6), 'nano');
  assert.equal(capTier(150e6), 'micro');
  assert.equal(capTier(1.4e9), 'small');
  assert.equal(capTier(900e9), 'mid-plus');
  assert.equal(capTier(null), 'unknown');
  assert.equal(capTier(undefined), 'unknown');
  assert.equal(isSmallCap('unknown'), false, 'an unpriced watchlist must behave as it did before');
});

// --- cap-relative 8-K severity ---------------------------------------------

test('an earnings release is promoted to high for a micro cap and left alone for a mega cap', () => {
  const micro = resolveItemSeverity('2.02', 'medium', 'micro');
  assert.equal(micro.severity, 'high');
  assert.ok(micro.note.length > 0);

  const mega = resolveItemSeverity('2.02', 'medium', 'mid-plus');
  assert.equal(mega.severity, 'medium');
  assert.equal(mega.note, '');
});

test('items already loud in the base table are not double-promoted', () => {
  // 4.02 (non-reliance) is critical everywhere; there is no notch above it.
  assert.equal(resolveItemSeverity('4.02', 'critical', 'nano').severity, 'critical');
  // 3.02 (unregistered sales) is high at any size and is not cap-relative.
  assert.equal(resolveItemSeverity('3.02', 'high', 'nano').severity, 'high');
});

test('direction is carried per item rather than assumed bearish', () => {
  assert.equal(resolveItemSeverity('3.01', 'critical', 'micro').direction, 'bearish');
  assert.equal(resolveItemSeverity('2.02', 'medium', 'micro').direction, 'ambiguous');
});

// --- index-only forms ------------------------------------------------------

test('index-only forms match their amendments and ignore unrelated forms', () => {
  assert.equal(indexOnlyFormDef('424B5')?.kind, 'offering');
  assert.equal(indexOnlyFormDef('S-3/A')?.kind, 'offering');
  assert.equal(indexOnlyFormDef('NT 10-Q')?.severity, 'critical');
  assert.equal(indexOnlyFormDef('SC 13D')?.direction, 'bullish');
  assert.equal(indexOnlyFormDef('10-K'), null);
  assert.equal(indexOnlyFormDef('8-A12B')?.kind, 'uplisting');
});

test('SC 13G is surfaced but its amendments are not', () => {
  // Every 13G holder re-files annually, and the market's worth of those
  // amendments lands in one February week. Treating them as new stakes would
  // bury the feed once a year in filings reporting that nothing changed.
  assert.equal(indexOnlyFormDef('SC 13G')?.direction, 'bullish');
  assert.equal(indexOnlyFormDef('SC 13G')?.severity, 'medium');
  assert.equal(indexOnlyFormDef('SC 13G/A'), null);
  // 13D is the ACTIVIST cousin and keeps its amendments — a 13D/A is how a
  // campaign escalates.
  assert.ok(indexOnlyFormDef('SC 13D/A'));
});

// --- dilution --------------------------------------------------------------

test('a 30% quarterly jump in diluted shares is critical', () => {
  const f = detectDilution(
    set(quarterly('dilutedShares', [['2025Q3', 10e6], ['2025Q4', 13e6]])),
  )!;
  assert.equal(f.severity, 'critical');
  assert.ok(f.quarterOverQuarter! > 0.29 && f.quarterOverQuarter! < 0.31);
  assert.match(f.headline, /\+30\.0% QoQ/);
});

test('a slow-growing share count produces no dilution signal', () => {
  const f = detectDilution(
    set(
      quarterly('dilutedShares', [
        ['2025Q1', 10.0e6],
        ['2025Q2', 10.1e6],
        ['2025Q3', 10.2e6],
        ['2025Q4', 10.3e6],
        ['2026Q1', 10.4e6],
      ]),
    ),
  );
  assert.equal(f, null);
});

test('a year-over-year doubling is caught even when no single quarter jumps', () => {
  const f = detectDilution(
    set(
      quarterly('dilutedShares', [
        ['2025Q1', 10e6],
        ['2025Q2', 11.5e6],
        ['2025Q3', 13.2e6],
        ['2025Q4', 15.2e6],
        ['2026Q1', 17.4e6],
      ]),
    ),
  )!;
  assert.equal(f.severity, 'high');
  assert.ok(f.yearOverYear! > 0.7);
});

test('a units re-tag (thousands to units) is rejected rather than reported as dilution', () => {
  const f = detectDilution(
    set(quarterly('dilutedShares', [['2025Q3', 10e3], ['2025Q4', 10e6]])),
  );
  assert.equal(f, null);
});

// --- cash runway -----------------------------------------------------------

test('a burner with under two quarters of cash is critical', () => {
  const f = detectCashRunway(
    set(
      quarterly('cash', [['2026Q1', 8e6]]),
      quarterly('cfo', [
        ['2025Q2', -5e6],
        ['2025Q3', -5e6],
        ['2025Q4', -5e6],
        ['2026Q1', -5e6],
      ]),
    ),
  )!;
  assert.equal(f.severity, 'critical');
  assert.ok(f.runwayQuarters < 2);
  assert.match(f.headline, /month/);
});

test('capex counts against runway regardless of the sign the filer tagged it with', () => {
  const cfo = quarterly('cfo', [
    ['2025Q2', -1e6],
    ['2025Q3', -1e6],
    ['2025Q4', -1e6],
    ['2026Q1', -1e6],
  ]);
  const cash = quarterly('cash', [['2026Q1', 10e6]]);
  const positiveCapex = detectCashRunway(
    set(cash, cfo, quarterly('capex', [['2026Q1', 4e6], ['2025Q4', 4e6], ['2025Q3', 4e6], ['2025Q2', 4e6]])),
  )!;
  const negativeCapex = detectCashRunway(
    set(cash, cfo, quarterly('capex', [['2026Q1', -4e6], ['2025Q4', -4e6], ['2025Q3', -4e6], ['2025Q2', -4e6]])),
  )!;
  assert.equal(positiveCapex.quarterlyBurn, negativeCapex.quarterlyBurn);
  assert.equal(positiveCapex.quarterlyBurn, 5e6);
});

test('a cash-generative company has no runway finding', () => {
  const f = detectCashRunway(
    set(
      quarterly('cash', [['2026Q1', 8e6]]),
      quarterly('cfo', [
        ['2025Q2', 5e6],
        ['2025Q3', 5e6],
        ['2025Q4', 5e6],
        ['2026Q1', 5e6],
      ]),
    ),
  );
  assert.equal(f, null);
});

test('too few quarters to establish a burn rate yields nothing', () => {
  const f = detectCashRunway(
    set(quarterly('cash', [['2026Q1', 1e6]]), quarterly('cfo', [['2026Q1', -5e6]])),
  );
  assert.equal(f, null);
});

// --- Altman gating ---------------------------------------------------------

test('for a micro cap, only the transition into distress is news', () => {
  const alwaysDistressed = [year(2024, DISTRESSED), year(2025, DISTRESSED)];
  assert.equal(altmanIsNews(alwaysDistressed, 'micro'), false);
  assert.equal(altmanIsNews(alwaysDistressed, 'mid-plus'), true, 'unchanged for large caps');

  const newlyDistressed = [year(2024), year(2025, DISTRESSED)];
  assert.equal(altmanIsNews(newlyDistressed, 'micro'), true);
});
