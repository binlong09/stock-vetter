import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildConceptSeries, type ConceptSeries, type SeriesSet } from '@stock-vetter/core';
import { detectTrends } from './trends.js';
import { computeRatios } from './ratios.js';
import { FORENSIC_CONCEPTS } from './concepts.js';

type Row = { fy: number; fp: 'Q1' | 'Q2' | 'Q3' | 'Q4'; values: Record<string, number> };

const QUARTER_ENDS: Record<string, [string, string]> = {
  Q1: ['-01-01', '-03-31'],
  Q2: ['-04-01', '-06-30'],
  Q3: ['-07-01', '-09-30'],
  Q4: ['-10-01', '-12-31'],
};

// Concepts that are balance-sheet instants; everything else is a flow.
const INSTANTS = new Set(
  FORENSIC_CONCEPTS.filter((c) => c.kind === 'instant').map((c) => c.concept),
);

/** Build a SeriesSet directly, bypassing the XBRL payload shape. */
function seriesSet(rows: Row[]): SeriesSet {
  const tags: Record<string, any[]> = {};
  for (const row of rows) {
    const [s, e] = QUARTER_ENDS[row.fp]!;
    const start = `${row.fy}${s}`;
    const end = `${row.fy}${e}`;
    for (const [concept, value] of Object.entries(row.values)) {
      const spec = FORENSIC_CONCEPTS.find((c) => c.concept === concept);
      if (!spec) throw new Error(`unknown concept in fixture: ${concept}`);
      const tag = spec.tags[0]!;
      (tags[tag] ??= []).push(
        INSTANTS.has(concept)
          ? { end, val: value, fy: row.fy, fp: row.fp, form: '10-Q' }
          : { start, end, val: value, fy: row.fy, fp: row.fp, form: '10-Q' },
      );
    }
  }

  const byConcept = new Map<string, ConceptSeries>();
  const missing: string[] = [];
  for (const spec of FORENSIC_CONCEPTS) {
    const relevant = Object.fromEntries(
      spec.tags.filter((t) => tags[t]).map((t) => [t, { units: { [spec.unit ?? 'USD']: tags[t] } }]),
    );
    const s = buildConceptSeries({ cik: 1, facts: { 'us-gaap': relevant } } as any, spec);
    if (!s.quarterly.length) missing.push(spec.concept);
    byConcept.set(spec.concept, s);
  }
  return { cik: '1', entityName: 'Test Co', byConcept, missing };
}

/** Eight quarters (2024-2025) with a per-quarter override hook. */
function eightQuarters(
  base: Record<string, number>,
  adjust: (fy: number, fp: string, i: number) => Record<string, number>,
): Row[] {
  const rows: Row[] = [];
  let i = 0;
  for (const fy of [2024, 2025]) {
    for (const fp of ['Q1', 'Q2', 'Q3', 'Q4'] as const) {
      rows.push({ fy, fp, values: { ...base, ...adjust(fy, fp, i) } });
      i++;
    }
  }
  return rows;
}

const BASE = {
  revenue: 1000,
  costOfRevenue: 600,
  accountsReceivable: 700,
  inventory: 400,
  accountsPayable: 300,
  totalAssets: 5000,
  netIncome: 100,
  cfo: 110,
  sga: 200,
  cash: 200,
  longTermDebt: 500,
  dilutedShares: 100e6,
};

test('a steady business produces no findings', () => {
  const set = seriesSet(eightQuarters(BASE, () => ({})));
  const r = detectTrends(set);
  assert.deepEqual(r.findings, [], `unexpected findings: ${r.findings.map((f) => f.id).join(', ')}`);
});

test('receivables lengthening for several quarters is detected', () => {
  // AR climbs while revenue holds: DSO goes from ~64 to ~91 days.
  const set = seriesSet(
    eightQuarters(BASE, (fy, _fp, i): Record<string, number> => (fy === 2025 ? { accountsReceivable: 700 + (i - 3) * 35 } : {})),
  );
  const f = detectTrends(set).findings.find((x) => x.id === 'dso-lengthening');
  assert.ok(f, 'DSO lengthening not detected');
  assert.equal(f.category, 'receivables-quality');
  assert.ok(f.consecutivePeriods >= 3);
  assert.match(f.claim, /Days sales outstanding lengthened/);
  // The finding must carry its own audit trail.
  assert.ok(f.series.length >= 3);
  assert.ok(f.sourceTags.includes('AccountsReceivableNetCurrent'));
});

test('SEASONALITY: a retailer with a huge but stable Q4 produces no findings', () => {
  // This is the test that separates a usable detector from a useless one. A
  // sequential comparison reports this business every single year.
  const set = seriesSet(
    eightQuarters(BASE, (_fy, fp): Record<string, number> =>
      fp === 'Q4'
        ? { revenue: 2500, costOfRevenue: 1500, inventory: 1200, accountsReceivable: 1600, accountsPayable: 900 }
        : fp === 'Q3'
          ? { inventory: 1000, accountsPayable: 700 }
          : {},
    ),
  );
  const r = detectTrends(set);
  assert.deepEqual(
    r.findings.map((f) => f.id),
    [],
    'seasonal swings were reported as trends',
  );
});

test('a single bad quarter is not a trend', () => {
  const set = seriesSet(
    eightQuarters(BASE, (fy, fp): Record<string, number> => (fy === 2025 && fp === 'Q4' ? { accountsReceivable: 1400 } : {})),
  );
  // One acquisition closing near period end inflates DSO once. Requiring a run
  // is what keeps that out of the queue.
  assert.equal(detectTrends(set).findings.some((f) => f.id === 'dso-lengthening'), false);
});

test('a real deterioration that is too small to matter is not reported', () => {
  // DSO drifts up ~1 day per quarter — directionally consistent, immaterial.
  const set = seriesSet(
    eightQuarters(BASE, (fy, _fp, i): Record<string, number> => (fy === 2025 ? { accountsReceivable: 700 + (i - 3) * 4 } : {})),
  );
  assert.equal(detectTrends(set).findings.some((f) => f.id === 'dso-lengthening'), false);
});

test('cash flow diverging from earnings is detected', () => {
  const set = seriesSet(
    eightQuarters(BASE, (fy, _fp, i): Record<string, number> => (fy === 2025 ? { cfo: 110 - (i - 3) * 22 } : {})),
  );
  const f = detectTrends(set).findings.find((x) => x.id === 'cfo-diverging-from-earnings');
  assert.ok(f, 'CFO/NI divergence not detected');
  assert.match(f.claim, /not converting to cash/);
});

test('gross margin erosion is reported in basis points, not as a percent change', () => {
  const set = seriesSet(
    eightQuarters(BASE, (fy, _fp, i): Record<string, number> => (fy === 2025 ? { costOfRevenue: 600 + (i - 3) * 20 } : {})),
  );
  const f = detectTrends(set).findings.find((x) => x.id === 'gross-margin-eroding');
  assert.ok(f);
  assert.equal(f.changeUnit, 'bps');
  // 44.7% → 43.7% is 100bps. Calling it "a 2.2% decline" understates it and
  // invites confusion with a 2.2-point decline.
  assert.ok(Math.abs(f.change) > 100, `change was ${f.change}bps`);
});

test('dilution is detected from the diluted share count', () => {
  const set = seriesSet(
    eightQuarters(BASE, (fy, _fp, i): Record<string, number> => (fy === 2025 ? { dilutedShares: 100e6 * (1 + (i - 3) * 0.02) } : {})),
  );
  const f = detectTrends(set).findings.find((x) => x.id === 'share-count-growing');
  assert.ok(f);
  assert.equal(f.category, 'dilution');
});

test('an improving business produces no deterioration findings', () => {
  const set = seriesSet(
    eightQuarters(BASE, (fy, _fp, i): Record<string, number> =>
      fy === 2025 ? { accountsReceivable: 700 - (i - 3) * 30, cfo: 110 + (i - 3) * 15 } : {},
    ),
  );
  const r = detectTrends(set);
  assert.ok(r.findings.every((f) => f.direction === 'deteriorating'));
  assert.equal(r.findings.some((f) => f.id === 'dso-lengthening'), false);
  assert.equal(r.findings.some((f) => f.id === 'cfo-diverging-from-earnings'), false);
});

test('severity rises with the length of the run', () => {
  const short = seriesSet(
    eightQuarters(BASE, (fy, _fp, i): Record<string, number> => (fy === 2025 && i >= 5 ? { accountsReceivable: 700 + (i - 4) * 60 } : {})),
  );
  const long = seriesSet(
    eightQuarters(BASE, (fy, _fp, i): Record<string, number> => (fy === 2025 ? { accountsReceivable: 700 + (i - 3) * 60 } : {})),
  );
  const a = detectTrends(short).findings.find((f) => f.id === 'dso-lengthening');
  const b = detectTrends(long).findings.find((f) => f.id === 'dso-lengthening');
  assert.ok(a && b);
  assert.ok(b.consecutivePeriods > a.consecutivePeriods);
  const rank = { low: 0, medium: 1, high: 2 };
  assert.ok(rank[b.severity] >= rank[a.severity]);
});

test('too little history yields no findings and says why', () => {
  const set = seriesSet([
    { fy: 2025, fp: 'Q1', values: BASE },
    { fy: 2025, fp: 'Q2', values: BASE },
  ]);
  const r = detectTrends(set);
  assert.deepEqual(r.findings, []);
  assert.equal(r.periodsAvailable, 2);
  assert.match(r.warnings[0]!, /at least 5 are needed/);
});

test('an as-of cutoff excludes periods the filing could not have known', () => {
  const rows = eightQuarters(BASE, (fy, _fp, i): Record<string, number> => (fy === 2025 ? { accountsReceivable: 700 + (i - 3) * 60 } : {}));
  const set = seriesSet(rows);
  const full = detectTrends(set);
  const asOf = detectTrends(set, { asOf: '2025-03-31' });
  assert.ok(full.findings.some((f) => f.id === 'dso-lengthening'));
  // As of Q1 2025 the deterioration has barely started; reporting the full
  // trend here would be using data that did not exist when the filing was made.
  assert.equal(asOf.latestPeriod, '2025Q1');
  assert.ok(asOf.periodsAvailable < full.periodsAvailable);
});

test('a restated prior period is surfaced as its own finding', () => {
  const set = seriesSet(eightQuarters(BASE, () => ({})));
  // Simulate a later filing revising 2025Q2 revenue.
  const rev = set.byConcept.get('revenue')!;
  const q2 = rev.quarterly.find((p) => p.period === '2025Q2')!;
  q2.restatedFrom = 1200;
  const f = detectTrends(set).findings.find((x) => x.id === 'prior-period-restated');
  assert.ok(f, 'restatement not surfaced');
  assert.match(f.claim, /changed figures it had already reported/);
});

test('missing concepts disable their detectors and are reported, not guessed', () => {
  const set = seriesSet(eightQuarters({ revenue: 1000, netIncome: 100 }, () => ({})));
  const r = detectTrends(set);
  assert.ok(r.unavailable.includes('dso-lengthening'));
  assert.ok(r.warnings.some((w) => /untagged by this filer/.test(w)));
});

test('ratios line balance-sheet instants up with the right income period', () => {
  const set = seriesSet(eightQuarters(BASE, () => ({})));
  const rows = computeRatios(set);
  const q = rows.find((r) => r.period === '2025Q2')!;
  // DSO = 700/1000 × 91 days ≈ 64.
  assert.ok(q.dso! > 60 && q.dso! < 70, `DSO was ${q.dso}`);
  assert.ok(Math.abs(q.grossMargin! - 0.4) < 1e-9);
  assert.ok(Math.abs(q.cfoToNetIncome! - 1.1) < 1e-9);
});
