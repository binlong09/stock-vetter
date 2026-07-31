// XBRL series construction, tested against payloads that reproduce the quirks
// real company-facts responses actually contain. EDGAR is unreachable from CI,
// so these fixtures ARE the contract.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildConceptSeries, pointsAsOf, recentQuarters, type ConceptSpec } from './xbrl.js';

type V = {
  start?: string;
  end: string;
  val: number;
  fy: number;
  fp: string;
  form: string;
  filed?: string;
};

function facts(tags: Record<string, V[]>, unit = 'USD'): any {
  return {
    cik: 1,
    entityName: 'Test Co',
    facts: {
      'us-gaap': Object.fromEntries(
        Object.entries(tags).map(([tag, values]) => [tag, { units: { [unit]: values } }]),
      ),
    },
  };
}

const REVENUE: ConceptSpec = { concept: 'revenue', kind: 'duration', tags: ['Revenues'] };
const AR: ConceptSpec = { concept: 'ar', kind: 'instant', tags: ['AccountsReceivableNetCurrent'] };

test('cumulative year-to-date facts are excluded from the quarterly series', () => {
  // A Q3 10-Q reports BOTH a 3-month and a 9-month figure, both tagged Q3.
  // Admitting the 9-month one makes revenue appear to triple every Q3.
  const s = buildConceptSeries(
    facts({
      Revenues: [
        { start: '2025-01-01', end: '2025-03-31', val: 100, fy: 2025, fp: 'Q1', form: '10-Q' },
        { start: '2025-04-01', end: '2025-06-30', val: 110, fy: 2025, fp: 'Q2', form: '10-Q' },
        { start: '2025-01-01', end: '2025-06-30', val: 210, fy: 2025, fp: 'Q2', form: '10-Q' },
        { start: '2025-07-01', end: '2025-09-30', val: 120, fy: 2025, fp: 'Q3', form: '10-Q' },
        { start: '2025-01-01', end: '2025-09-30', val: 330, fy: 2025, fp: 'Q3', form: '10-Q' },
      ],
    }),
    REVENUE,
  );
  assert.deepEqual(
    s.quarterly.map((p) => [p.period, p.value]),
    [
      ['2025Q1', 100],
      ['2025Q2', 110],
      ['2025Q3', 120],
    ],
  );
});

test('Q4 is derived from the annual total and labelled as derived', () => {
  const s = buildConceptSeries(
    facts({
      Revenues: [
        { start: '2025-01-01', end: '2025-03-31', val: 100, fy: 2025, fp: 'Q1', form: '10-Q' },
        { start: '2025-04-01', end: '2025-06-30', val: 110, fy: 2025, fp: 'Q2', form: '10-Q' },
        { start: '2025-07-01', end: '2025-09-30', val: 120, fy: 2025, fp: 'Q3', form: '10-Q' },
        { start: '2025-01-01', end: '2025-12-31', val: 500, fy: 2025, fp: 'FY', form: '10-K' },
      ],
    }),
    REVENUE,
  );
  const q4 = s.quarterly.find((p) => p.fp === 'Q4')!;
  // Filers report the full year on the 10-K and rarely a discrete Q4; without
  // this every company appears to stop reporting for three months a year.
  assert.equal(q4.value, 170);
  assert.equal(q4.derived, 'q4-residual');
  assert.equal(s.annual.length, 1);
  assert.equal(s.annual[0]!.value, 500);
});

test('Q4 is not fabricated when a quarter is missing', () => {
  const s = buildConceptSeries(
    facts({
      Revenues: [
        { start: '2025-01-01', end: '2025-03-31', val: 100, fy: 2025, fp: 'Q1', form: '10-Q' },
        { start: '2025-07-01', end: '2025-09-30', val: 120, fy: 2025, fp: 'Q3', form: '10-Q' },
        { start: '2025-01-01', end: '2025-12-31', val: 500, fy: 2025, fp: 'FY', form: '10-K' },
      ],
    }),
    REVENUE,
  );
  // With Q2 absent the residual would be 280 and simply wrong.
  assert.equal(s.quarterly.some((p) => p.fp === 'Q4'), false);
});

test('a comparative quarter mistagged FY inside a 10-K is not read as the year', () => {
  const s = buildConceptSeries(
    facts({
      Revenues: [
        // ~90 days but tagged FY — a comparative quarter in an annual report.
        { start: '2025-10-01', end: '2025-12-31', val: 170, fy: 2025, fp: 'FY', form: '10-K' },
        { start: '2025-01-01', end: '2025-12-31', val: 500, fy: 2025, fp: 'FY', form: '10-K' },
      ],
    }),
    REVENUE,
  );
  assert.equal(s.annual.length, 1);
  assert.equal(s.annual[0]!.value, 500);
});

test('overlapping tags for one period do not read as a restatement', () => {
  // A concept lists its tags in priority order to survive MIGRATION, but some
  // filers report more than one at once — PG carries InventoryNet alongside
  // InventoryFinishedGoodsNetOfReserves, a component of it. Concatenating both
  // puts two different values on one period and fabricates a restatement every
  // quarter. The highest-priority tag that covers a period must supply it.
  const s = buildConceptSeries(
    facts({
      InventoryNet: [{ end: '2025-03-31', val: 7400, fy: 2025, fp: 'Q1', form: '10-Q' }],
      InventoryFinishedGoodsNetOfReserves: [{ end: '2025-03-31', val: 4508, fy: 2025, fp: 'Q1', form: '10-Q' }],
    }),
    {
      concept: 'inventory',
      kind: 'instant',
      tags: ['InventoryNet', 'InventoryFinishedGoodsNetOfReserves'],
    },
  );
  const q1 = s.quarterly.find((p) => p.period === '2025Q1');
  assert.equal(q1?.value, 7400, 'the primary tag wins, not its finished-goods component');
  assert.equal(q1?.restatedFrom, undefined, 'no phantom restatement');
  assert.deepEqual(s.matchedTags, ['InventoryNet']);
});

test('concept-tag migration is stitched into one continuous series', () => {
  // ASC 606 moved most of the market off `Revenues` in 2018. A series keyed on
  // one tag shows sales going to zero and reappearing at the migration.
  const s = buildConceptSeries(
    facts({
      Revenues: [{ start: '2024-01-01', end: '2024-03-31', val: 90, fy: 2024, fp: 'Q1', form: '10-Q' }],
      RevenueFromContractWithCustomerExcludingAssessedTax: [
        { start: '2025-01-01', end: '2025-03-31', val: 100, fy: 2025, fp: 'Q1', form: '10-Q' },
      ],
    }),
    {
      concept: 'revenue',
      kind: 'duration',
      tags: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues'],
    },
  );
  assert.equal(s.quarterly.length, 2);
  assert.deepEqual(s.matchedTags.sort(), ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues']);
});

test('the most recently filed value wins and the revision is preserved', () => {
  const s = buildConceptSeries(
    facts({
      Revenues: [
        { start: '2025-01-01', end: '2025-03-31', val: 100, fy: 2025, fp: 'Q1', form: '10-Q', filed: '2025-05-01' },
        // Restated a year later in the comparatives of the next year's 10-Q.
        { start: '2025-01-01', end: '2025-03-31', val: 88, fy: 2025, fp: 'Q1', form: '10-Q', filed: '2026-05-01' },
      ],
    }),
    REVENUE,
  );
  assert.equal(s.quarterly.length, 1);
  assert.equal(s.quarterly[0]!.value, 88);
  // A company quietly revising a period it already reported is itself a short
  // signal; dropping the old value would throw that away.
  assert.equal(s.quarterly[0]!.restatedFrom, 100);
});

test('a chain of restatements preserves the value as first disclosed', () => {
  // Revised twice: the signal is the drift from what was ORIGINALLY reported
  // (100 → 80), not from the intermediate revision (90 → 80).
  const s = buildConceptSeries(
    facts({
      Revenues: [
        { start: '2025-01-01', end: '2025-03-31', val: 100, fy: 2025, fp: 'Q1', form: '10-Q', filed: '2025-05-01' },
        { start: '2025-01-01', end: '2025-03-31', val: 90, fy: 2025, fp: 'Q1', form: '10-Q', filed: '2026-05-01' },
        { start: '2025-01-01', end: '2025-03-31', val: 80, fy: 2025, fp: 'Q1', form: '10-Q', filed: '2027-05-01' },
      ],
    }),
    REVENUE,
  );
  assert.equal(s.quarterly[0]!.value, 80);
  assert.equal(s.quarterly[0]!.restatedFrom, 100);
});

test('a fact mis-scaled in one filing is reconciled, not read as a restatement', () => {
  // A real filer quirk (CHD's 2026 10-K): one concept is tagged in MILLIONS
  // (1838.7) in one filing while every other report uses dollars
  // (1,838,700,000). Within a concept a value never legitimately jumps 1000x
  // between reports, so the odd one out is a units error — reconcile it to the
  // series consensus rather than reading the gap as a $1.8B → $1,838 restatement.
  const s = buildConceptSeries(
    facts({
      IntangibleAssetsNetExcludingGoodwill: [
        { end: '2021-12-31', val: 1_200_000_000, fy: 2021, fp: 'FY', form: '10-K', filed: '2022-02-01' },
        { end: '2022-12-31', val: 1_300_000_000, fy: 2022, fp: 'FY', form: '10-K', filed: '2023-02-01' },
        { end: '2023-12-31', val: 1_500_000_000, fy: 2023, fp: 'FY', form: '10-K', filed: '2024-02-01' },
        { end: '2024-12-31', val: 1_700_000_000, fy: 2024, fp: 'FY', form: '10-K', filed: '2025-02-01' },
        // Reported first in the 10-K, mis-tagged in millions…
        { end: '2025-12-31', val: 1838.7, fy: 2025, fp: 'FY', form: '10-K', filed: '2026-02-01' },
        // …then as a comparative in the next 10-Q, correctly in dollars.
        { end: '2025-12-31', val: 1_838_700_000, fy: 2026, fp: 'Q1', form: '10-Q', filed: '2026-05-01' },
      ],
    }),
    { concept: 'intangibles', kind: 'instant', tags: ['IntangibleAssetsNetExcludingGoodwill'] },
  );
  const p = s.annual.find((a) => a.period === '2025FY');
  assert.ok(p, 'the 2025 year-end balance is present');
  assert.ok(
    Math.abs(p!.value - 1_838_700_000) / 1_838_700_000 < 0.01,
    `expected ~1.84e9 after rescaling, got ${p!.value}`,
  );
  assert.equal(p!.restatedFrom, undefined, 'a units error is not a restatement');
});

test('an unchanged re-report is not treated as a restatement', () => {
  const s = buildConceptSeries(
    facts({
      Revenues: [
        { start: '2025-01-01', end: '2025-03-31', val: 100, fy: 2025, fp: 'Q1', form: '10-Q', filed: '2025-05-01' },
        { start: '2025-01-01', end: '2025-03-31', val: 100, fy: 2025, fp: 'Q1', form: '10-Q', filed: '2026-05-01' },
      ],
    }),
    REVENUE,
  );
  assert.equal(s.quarterly[0]!.restatedFrom, undefined);
});

test('a comparative carrying a later filing fy does not fabricate a restatement', () => {
  // The SEC `fy`/`fp` on a fact belong to the FILING that reported it, not to
  // the period the fact covers. Q2-2018 re-reported as the prior-year
  // comparative in the 2019 Q2 10-Q carries fy=2019/fp=Q2 while keeping its own
  // 2018 dates. Keying on fy/fp collides it with the real 2019 Q2 and reads the
  // value gap as a phantom restatement — on essentially every filer.
  const s = buildConceptSeries(
    facts({
      Revenues: [
        { start: '2018-04-01', end: '2018-06-30', val: 1027, fy: 2018, fp: 'Q2', form: '10-Q', filed: '2018-08-02' },
        { start: '2019-04-01', end: '2019-06-30', val: 1105, fy: 2019, fp: 'Q2', form: '10-Q', filed: '2019-07-31' },
        // The 2019 Q2 10-Q also carries Q2-2018 as its comparative, tagged with
        // the reporting filing's fy/fp.
        { start: '2018-04-01', end: '2018-06-30', val: 1027, fy: 2019, fp: 'Q2', form: '10-Q', filed: '2019-07-31' },
      ],
    }),
    REVENUE,
  );
  assert.deepEqual(
    s.quarterly.map((p) => [p.period, p.value, p.restatedFrom ?? null]),
    [
      ['2018Q2', 1027, null],
      ['2019Q2', 1105, null],
    ],
  );
});

test('a year-end balance re-reported as a quarterly comparative keeps its own period', () => {
  // A 10-Q's balance sheet shows the prior YEAR-END as its comparative column,
  // tagged with the reporting quarter's fy/fp: the 2019 Q1 10-Q reports the
  // 2018-12-31 balance as (fy=2019, fp=Q1). Keying on fy/fp turns that year-end
  // into a phantom 2019 Q1 balance and flags a restatement against the real one.
  const s = buildConceptSeries(
    facts({
      AccountsReceivableNetCurrent: [
        { end: '2018-12-31', val: 300, fy: 2018, fp: 'FY', form: '10-K', filed: '2019-02-21' },
        { end: '2019-03-31', val: 340, fy: 2019, fp: 'Q1', form: '10-Q', filed: '2019-05-02' },
        // The 2019 Q1 10-Q's comparative column: last year's year-end balance.
        { end: '2018-12-31', val: 300, fy: 2019, fp: 'Q1', form: '10-Q', filed: '2019-05-02' },
      ],
    }),
    AR,
  );
  const q1 = s.quarterly.find((p) => p.period === '2019Q1');
  assert.equal(q1?.value, 340, 'the real Q1 balance, not the year-end comparative');
  assert.equal(q1?.restatedFrom, undefined, 'no phantom restatement');
  // The 2018 year-end appears once, as FY (and Q4) — never as a 2019 quarter.
  assert.equal(s.annual.find((p) => p.period === '2018FY')?.value, 300);
  assert.equal(s.quarterly.filter((p) => p.period === '2019Q1').length, 1);
});

test('precision drift between a value and its comparative is not a restatement', () => {
  // Filers re-report a figure at coarser precision in later comparatives
  // (231,055,000 disclosed, then 231,100,000 rounded to the nearest hundred
  // thousand a year later). That is rounding, not a revision.
  const s = buildConceptSeries(
    facts({
      AccountsReceivableNetCurrent: [
        { end: '2018-12-31', val: 231_055_000, fy: 2018, fp: 'FY', form: '10-K', filed: '2019-02-21' },
        { end: '2018-12-31', val: 231_100_000, fy: 2019, fp: 'Q1', form: '10-Q', filed: '2019-05-02' },
      ],
    }),
    AR,
  );
  assert.equal(s.annual.find((p) => p.period === '2018FY')?.restatedFrom, undefined);
});

test('instant facts build a balance series and the year end doubles as Q4', () => {
  const s = buildConceptSeries(
    facts({
      AccountsReceivableNetCurrent: [
        { end: '2025-03-31', val: 900, fy: 2025, fp: 'Q1', form: '10-Q' },
        { end: '2025-12-31', val: 1200, fy: 2025, fp: 'FY', form: '10-K' },
      ],
    }),
    AR,
  );
  assert.equal(s.annual.length, 1);
  // A fiscal-year-end balance IS the Q4 balance; publishing it under both keys
  // lets ratio code join balance-sheet and income-statement series on one
  // period key.
  const q4 = s.quarterly.find((p) => p.period === '2025Q4');
  assert.equal(q4?.value, 1200);
});

test('a duration fact never contaminates an instant series', () => {
  const s = buildConceptSeries(
    facts({
      AccountsReceivableNetCurrent: [
        { start: '2025-01-01', end: '2025-03-31', val: 5, fy: 2025, fp: 'Q1', form: '10-Q' },
        { end: '2025-03-31', val: 900, fy: 2025, fp: 'Q1', form: '10-Q' },
      ],
    }),
    AR,
  );
  assert.equal(s.quarterly.length, 1);
  assert.equal(s.quarterly[0]!.value, 900);
});

test('a filer that tags nothing yields an empty series rather than throwing', () => {
  const s = buildConceptSeries(facts({}), REVENUE);
  assert.deepEqual(s.quarterly, []);
  assert.deepEqual(s.matchedTags, []);
});

test('pointsAsOf excludes facts filed about later periods', () => {
  // The payload contains periods that did not exist when the filing under
  // analysis was made. Using them is invisible in the output and fatal to a
  // backtest.
  const s = buildConceptSeries(
    facts({
      Revenues: [
        { start: '2025-01-01', end: '2025-03-31', val: 100, fy: 2025, fp: 'Q1', form: '10-Q' },
        { start: '2025-04-01', end: '2025-06-30', val: 110, fy: 2025, fp: 'Q2', form: '10-Q' },
        { start: '2025-07-01', end: '2025-09-30', val: 120, fy: 2025, fp: 'Q3', form: '10-Q' },
      ],
    }),
    REVENUE,
  );
  assert.equal(pointsAsOf(s.quarterly, '2025-06-30').length, 2);
  assert.equal(recentQuarters(s, 10, '2025-06-30').at(-1)!.period, '2025Q2');
  assert.equal(recentQuarters(s, 10).at(-1)!.period, '2025Q3');
});

test('a 4-4-5 fiscal calendar quarter is still recognized as a quarter', () => {
  // Retail calendars produce 84- and 98-day quarters; a strict 90-day window
  // would silently drop them.
  const s = buildConceptSeries(
    facts({
      Revenues: [
        { start: '2025-02-02', end: '2025-05-03', val: 100, fy: 2025, fp: 'Q1', form: '10-Q' },
        { start: '2025-05-04', end: '2025-08-02', val: 110, fy: 2025, fp: 'Q2', form: '10-Q' },
      ],
    }),
    REVENUE,
  );
  assert.equal(s.quarterly.length, 2);
});
