import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ConceptSeries, FactPoint, SeriesSet } from '@stock-vetter/core';
import {
  detectBuyback,
  detectProfitabilityTurn,
  detectFcfTurn,
  detectRevenueAcceleration,
  detectBullishInflections,
} from './inflection.js';

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

const REVENUE_OK = quarterly('revenue', [
  ['2025Q1', 20e6],
  ['2025Q2', 20e6],
  ['2025Q3', 20e6],
  ['2025Q4', 20e6],
  ['2026Q1', 20e6],
]);

// --- buyback ---------------------------------------------------------------

test('a steady share-count reduction is flagged as a buyback', () => {
  const f = detectBuyback(
    set(
      quarterly('dilutedShares', [
        ['2025Q1', 100e6],
        ['2025Q2', 98e6],
        ['2025Q3', 96e6],
        ['2025Q4', 94e6],
        ['2026Q1', 88e6],
      ]),
    ),
  )!;
  assert.equal(f.kind, 'buyback');
  assert.equal(f.severity, 'critical'); // −6.4% QoQ
  assert.match(f.headline, /shrinking/);
});

test('A REVERSE SPLIT IS NOT A BUYBACK — it is rejected outright', () => {
  // 1-for-10: the largest share-count "reduction" this detector will ever see,
  // and one of the most bearish events a small cap has. Reporting it as the
  // loudest bullish signal on the feed would be worse than having no detector.
  const f = detectBuyback(
    set(quarterly('dilutedShares', [['2025Q4', 100e6], ['2026Q1', 10e6]])),
  );
  assert.equal(f, null);
});

test('a flat or growing share count produces no buyback signal', () => {
  assert.equal(
    detectBuyback(set(quarterly('dilutedShares', [['2025Q4', 100e6], ['2026Q1', 100.1e6]]))),
    null,
  );
});

test('a slow year-long buyback is caught on the YoY leg alone', () => {
  const f = detectBuyback(
    set(
      quarterly('dilutedShares', [
        ['2025Q1', 100e6],
        ['2025Q2', 98.5e6],
        ['2025Q3', 97e6],
        ['2025Q4', 95.5e6],
        ['2026Q1', 94e6],
      ]),
    ),
  )!;
  assert.equal(f.severity, 'high'); // −6% YoY, only −1.6% QoQ
});

// --- profitability turn ----------------------------------------------------

test('the first operating profit after a long loss run is critical', () => {
  const f = detectProfitabilityTurn(
    set(
      quarterly('operatingIncome', [
        ['2025Q1', -3e6],
        ['2025Q2', -2e6],
        ['2025Q3', -1e6],
        ['2025Q4', -0.5e6],
        ['2026Q1', 1e6],
      ]),
      REVENUE_OK,
    ),
  )!;
  assert.equal(f.id, 'operating-profit-turn');
  assert.equal(f.severity, 'critical'); // 4 prior loss quarters
  assert.match(f.headline, /First operating profit in 5 quarters/);
});

test('an already-profitable company is not news', () => {
  // The transition is the event. A profitable company printing another
  // profitable quarter would otherwise fire every quarter, forever.
  assert.equal(
    detectProfitabilityTurn(
      set(
        quarterly('operatingIncome', [
          ['2025Q3', 1e6],
          ['2025Q4', 1.2e6],
          ['2026Q1', 1.4e6],
        ]),
        REVENUE_OK,
      ),
    ),
    null,
  );
});

test('a shell with no meaningful revenue is excluded', () => {
  const f = detectProfitabilityTurn(
    set(
      quarterly('operatingIncome', [
        ['2025Q2', -80e3],
        ['2025Q3', -60e3],
        ['2025Q4', -50e3],
        ['2026Q1', 40e3],
      ]),
      quarterly('revenue', [['2026Q1', 200e3]]),
    ),
  );
  assert.equal(f, null);
});

test('one loss quarter followed by a profit is not a turn', () => {
  assert.equal(
    detectProfitabilityTurn(
      set(
        quarterly('operatingIncome', [
          ['2025Q3', 1e6],
          ['2025Q4', -1e6],
          ['2026Q1', 1e6],
        ]),
        REVENUE_OK,
      ),
    ),
    null,
  );
});

// --- FCF turn --------------------------------------------------------------

test('free cash flow turning positive after a burn run is flagged', () => {
  const f = detectFcfTurn(
    set(
      quarterly('cfo', [
        ['2025Q2', -5e6],
        ['2025Q3', -4e6],
        ['2025Q4', -2e6],
        ['2026Q1', 3e6],
      ]),
      quarterly('capex', [
        ['2025Q2', 1e6],
        ['2025Q3', 1e6],
        ['2025Q4', 1e6],
        ['2026Q1', 1e6],
      ]),
      REVENUE_OK,
    ),
  )!;
  assert.equal(f.id, 'fcf-turn');
  assert.equal(f.severity, 'high'); // 3 prior burn quarters
});

test('capex large enough to keep FCF negative suppresses the turn', () => {
  const f = detectFcfTurn(
    set(
      quarterly('cfo', [
        ['2025Q2', -5e6],
        ['2025Q3', -4e6],
        ['2025Q4', -2e6],
        ['2026Q1', 3e6],
      ]),
      quarterly('capex', [
        ['2025Q2', 1e6],
        ['2025Q3', 1e6],
        ['2025Q4', 1e6],
        ['2026Q1', 5e6],
      ]),
      REVENUE_OK,
    ),
  );
  assert.equal(f, null);
});

// --- revenue acceleration --------------------------------------------------

test('year-over-year growth accelerating is flagged', () => {
  // 2025Q3→2026Q1 doubles the YoY rate: 25% then 60%.
  const f = detectRevenueAcceleration(
    set(
      quarterly('revenue', [
        ['2024Q4', 10e6],
        ['2025Q1', 10e6],
        ['2025Q2', 11e6],
        ['2025Q3', 12e6],
        ['2025Q4', 12.5e6],
        ['2026Q1', 16e6],
      ]),
    ),
  )!;
  assert.equal(f.id, 'revenue-acceleration');
  assert.match(f.headline, /accelerating/);
});

test('steady growth is not acceleration', () => {
  const steady = [1, 1.1, 1.21, 1.331, 1.4641, 1.61051].map(
    (m, i) => [`${2024 + Math.floor(i / 4)}Q${(i % 4) + 1}`, 10e6 * m] as [string, number],
  );
  assert.equal(detectRevenueAcceleration(set(quarterly('revenue', steady))), null);
});

test('a tiny revenue base cannot manufacture acceleration', () => {
  // $50k → $500k is +900% and means nothing.
  const f = detectRevenueAcceleration(
    set(
      quarterly('revenue', [
        ['2024Q4', 40e3],
        ['2025Q1', 50e3],
        ['2025Q2', 60e3],
        ['2025Q3', 70e3],
        ['2025Q4', 200e3],
        ['2026Q1', 500e3],
      ]),
    ),
  );
  assert.equal(f, null);
});

// --- aggregate -------------------------------------------------------------

test('a company with nothing bullish going on yields no findings', () => {
  assert.deepEqual(
    detectBullishInflections(
      set(
        quarterly('dilutedShares', [['2025Q4', 100e6], ['2026Q1', 101e6]]),
        quarterly('operatingIncome', [['2025Q4', -1e6], ['2026Q1', -1e6]]),
        REVENUE_OK,
      ),
    ),
    [],
  );
});

test('several inflections can fire together', () => {
  const findings = detectBullishInflections(
    set(
      quarterly('dilutedShares', [
        ['2025Q1', 100e6],
        ['2025Q2', 98e6],
        ['2025Q3', 96e6],
        ['2025Q4', 94e6],
        ['2026Q1', 88e6],
      ]),
      quarterly('operatingIncome', [
        ['2025Q1', -3e6],
        ['2025Q2', -2e6],
        ['2025Q3', -1e6],
        ['2025Q4', -0.5e6],
        ['2026Q1', 1e6],
      ]),
      REVENUE_OK,
    ),
  );
  assert.equal(findings.length, 2);
  assert.deepEqual(
    findings.map((f) => f.id).sort(),
    ['buyback', 'operating-profit-turn'],
  );
});
