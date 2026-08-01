import { test } from 'node:test';
import assert from 'node:assert/strict';
import { altmanZScore, beneishMScore } from './composite-scores.js';
import type { AnnualFundamentals } from './ratios.js';

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

// --- Beneish ---------------------------------------------------------------

test('a stable company scores well below the manipulation threshold', () => {
  const m = beneishMScore([year(2024), year(2025)])!;
  assert.ok(m.mScore! < -1.78, `M-score was ${m.mScore}`);
  assert.equal(m.flagged, false);
});

test('receivables outgrowing sales pushes DSRI and the score up', () => {
  const clean = beneishMScore([year(2024), year(2025)])!;
  const dirty = beneishMScore([
    year(2024),
    year(2025, { accountsReceivable: 500, cfo: 20, incomeContinuingOps: 140 }),
  ])!;
  assert.ok(dirty.mScore! > clean.mScore!);
  const dsri = dirty.indices.find((i) => i.name === 'DSRI')!;
  assert.ok(dsri.value! > 2, `DSRI was ${dsri.value}`);
  assert.equal(dirty.flagged, true);
});

test('the dominant index is reported so growth is not mistaken for fraud', () => {
  // An M-score driven entirely by sales growth describes a fast-growing
  // company. The headline number alone hides that completely.
  const m = beneishMScore([year(2024), year(2025, { revenue: 2200, grossProfit: 880, costOfRevenue: 1320 })])!;
  assert.equal(m.dominantIndex, 'SGI');
});

test('accruals dominate when earnings stop converting to cash', () => {
  const m = beneishMScore([year(2024), year(2025, { cfo: -200, incomeContinuingOps: 300 })])!;
  // TATA carries the heaviest coefficient in the model (4.679) by design.
  assert.equal(m.dominantIndex, 'TATA');
  assert.equal(m.flagged, true);
});

test('a slower depreciation rate raises DEPI', () => {
  const m = beneishMScore([year(2024), year(2025, { depreciationAmortization: 20 })])!;
  const depi = m.indices.find((i) => i.name === 'DEPI')!;
  // Extending useful lives flatters current earnings; this is where it shows.
  assert.ok(depi.value! > 1, `DEPI was ${depi.value}`);
});

test('missing inputs are substituted neutrally but disclosed', () => {
  const m = beneishMScore([
    year(2024, { sga: null, depreciationAmortization: null }),
    year(2025, { sga: null, depreciationAmortization: null }),
  ])!;
  assert.ok(m.missing.includes('SGAI'));
  assert.ok(m.missing.includes('DEPI'));
  // A score resting on substituted indices must not read as a measurement.
  assert.ok(m.mScore != null);
});

test('one year of history yields no score rather than a wrong one', () => {
  assert.equal(beneishMScore([year(2025)]), null);
});

test('every index carries an explanation of its direction', () => {
  const m = beneishMScore([year(2024), year(2025)])!;
  assert.equal(m.indices.length, 8);
  assert.ok(m.indices.every((i) => i.note.length > 10));
});

// --- Altman ----------------------------------------------------------------

test('a healthy balance sheet lands in the safe zone', () => {
  const z = altmanZScore([year(2025)])!;
  assert.ok(z.zScore! > 2.6, `Z was ${z.zScore}`);
  assert.equal(z.zone, 'safe');
});

test('a levered, loss-making balance sheet lands in distress', () => {
  const z = altmanZScore([
    year(2025, {
      currentAssets: 200,
      currentLiabilities: 900,
      retainedEarnings: -800,
      operatingIncome: -150,
      equity: 50,
      totalLiabilities: 1950,
    }),
  ])!;
  assert.ok(z.zScore! < 1.1, `Z was ${z.zScore}`);
  assert.equal(z.zone, 'distress');
});

test('a missing input yields no score rather than treating it as zero', () => {
  // A company with no retained-earnings tag is not a company with no retained
  // earnings, and scoring it as such would manufacture distress.
  const z = altmanZScore([year(2025, { retainedEarnings: null })])!;
  assert.equal(z.zScore, null);
  assert.equal(z.zone, 'unknown');
  assert.ok(z.missing.some((m) => m.includes('retained earnings')));
});

test('the variant used is stated, since thresholds differ between them', () => {
  const z = altmanZScore([year(2025)])!;
  assert.equal(z.variant, 'Z-double-prime');
  assert.equal(z.distressThreshold, 1.1);
});
