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
