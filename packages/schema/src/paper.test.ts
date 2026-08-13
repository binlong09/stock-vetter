import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPortfolio,
  summarizePortfolio,
  valuePosition,
  type PaperPosition,
  type PriceSeries,
} from './paper.js';

function position(over: Partial<PaperPosition> = {}): PaperPosition {
  return {
    id: 'acc-1:primary',
    accession: 'acc-1',
    ticker: 'AAAA',
    leg: 'primary',
    model: 'claude-sonnet-4-6',
    form: '10-Q',
    filingDate: '2026-05-01',
    conviction: 7,
    thesis: 'Margins inflected and the market is still pricing the loss run.',
    verdictAt: '2026-05-02T04:00:00.000Z',
    openedAt: '2026-05-02T06:00:00.000Z',
    entryDate: '2026-05-04',
    entryPrice: 10,
    notional: 10_000,
    benchmark: 'IWM',
    status: 'open',
    closedAt: null,
    exitDate: null,
    exitPrice: null,
    closeReason: null,
    ...over,
  };
}

function series(ticker: string, bars: [string, number, number?][]): PriceSeries {
  return bars.map(([asOf, close, adj]) => ({
    ticker,
    asOf,
    close,
    adjClose: adj ?? close,
  }));
}

const bench = series('IWM', [
  ['2026-05-04', 200],
  ['2026-05-11', 210], // +5% over the window
  ['2026-06-01', 220],
]);

test('values an open position off the adjusted closes', () => {
  const s = series('AAAA', [
    ['2026-05-04', 10],
    ['2026-05-11', 12],
  ]);
  const v = valuePosition(position(), s, bench);
  assert.equal(v.filled, true);
  assert.equal(v.markDate, '2026-05-11');
  assert.equal(v.markPrice, 12);
  assert.ok(Math.abs(v.returnPct! - 0.2) < 1e-9);
  assert.ok(Math.abs(v.marketValue! - 12_000) < 1e-6);
  assert.ok(Math.abs(v.pnl! - 2_000) < 1e-6);
  assert.ok(Math.abs(v.benchmarkReturnPct! - 0.05) < 1e-9);
  assert.ok(Math.abs(v.alphaPct! - 0.15) < 1e-9);
  assert.equal(v.holdingDays, 7);
});

// The bug this guards is the whole reason marks carry an adjusted close: a
// 1-for-10 reverse split takes the raw price from $10 to $100 with the holder
// no better off, and on raw closes that prints as +900%.
test('a reverse split does not become a ten-bagger', () => {
  const s = series('AAAA', [
    // After the split Yahoo restates history: the entry bar's adjusted close
    // is re-based to the post-split share, the raw close is not.
    ['2026-05-04', 10, 100],
    ['2026-05-11', 99, 99],
  ]);
  const v = valuePosition(position(), s, bench);
  assert.ok(Math.abs(v.returnPct! - -0.01) < 1e-9, `got ${v.returnPct}`);
});

test('a position with no fill yet is pending, not flat', () => {
  const v = valuePosition(position({ entryDate: null, entryPrice: null }), series('AAAA', []), bench);
  assert.equal(v.filled, false);
  assert.equal(v.returnPct, null);
  assert.equal(v.costBasis, null);
  assert.equal(v.marketValue, null);
});

test('a filled position with no marks reports its basis and no return', () => {
  const v = valuePosition(position(), series('AAAA', []), bench);
  assert.equal(v.filled, true);
  assert.equal(v.returnPct, null);
  assert.equal(v.costBasis, 10_000);
});

test('a closed position is valued at its exit, not at the latest bar', () => {
  const s = series('AAAA', [
    ['2026-05-04', 10],
    ['2026-05-11', 12],
    ['2026-06-01', 30],
  ]);
  const v = valuePosition(
    position({ status: 'closed', exitDate: '2026-05-11', exitPrice: 12, closedAt: '2026-05-11T20:00:00Z' }),
    s,
    bench,
  );
  assert.equal(v.markDate, '2026-05-11');
  assert.ok(Math.abs(v.returnPct! - 0.2) < 1e-9);
});

test('entry lookup tolerates a mark date that is not an exact bar', () => {
  // The stored entry_date always came from a real bar, but a marks table
  // rebuilt on a different session boundary shouldn't strand the position.
  const s = series('AAAA', [
    ['2026-05-01', 9],
    ['2026-05-06', 11],
  ]);
  const v = valuePosition(position({ entryDate: '2026-05-04' }), s, bench);
  assert.ok(Math.abs(v.returnPct! - (11 / 9 - 1)) < 1e-9);
});

test('portfolio aggregates are equal-weight and benchmark-matched', () => {
  const marks = new Map<string, PriceSeries>([
    ['AAAA', series('AAAA', [['2026-05-04', 10], ['2026-05-11', 12]])], // +20%
    ['BBBB', series('BBBB', [['2026-05-04', 10], ['2026-05-11', 9]])], // −10%
    ['IWM', bench],
  ]);
  const { summary } = buildPortfolio(
    [
      position(),
      position({ id: 'acc-2:primary', accession: 'acc-2', ticker: 'BBBB' }),
      // Unfilled: counted as pending, excluded from every return figure.
      position({ id: 'acc-3:primary', accession: 'acc-3', ticker: 'CCCC', entryDate: null, entryPrice: null }),
    ],
    marks,
    'IWM',
  );
  assert.equal(summary.valued, 2);
  assert.equal(summary.pending, 1);
  assert.equal(summary.costBasis, 20_000);
  assert.equal(summary.marketValue, 21_000);
  assert.ok(Math.abs(summary.returnPct! - 0.05) < 1e-9);
  assert.ok(Math.abs(summary.benchmarkReturnPct! - 0.05) < 1e-9);
  assert.ok(Math.abs(summary.alphaPct! - 0) < 1e-9);
  assert.equal(summary.winRate, 0.5);
  assert.equal(summary.beatBenchmarkRate, 0.5);
  assert.equal(summary.best!.position.ticker, 'AAAA');
  assert.equal(summary.worst!.position.ticker, 'BBBB');
});

// Alpha must compare the same set of positions on both sides: a name with no
// benchmark coverage would otherwise inflate (or deflate) one leg only.
test('alpha is computed over the benchmark-covered subset only', () => {
  const marks = new Map<string, PriceSeries>([
    ['AAAA', series('AAAA', [['2026-05-04', 10], ['2026-05-11', 12]])],
    // DDDD's window starts before the benchmark series does, so it has no
    // benchmark leg — it counts in the portfolio return, not in alpha.
    ['DDDD', series('DDDD', [['2026-01-05', 10], ['2026-05-11', 40]])],
    ['IWM', bench],
  ]);
  const { summary } = buildPortfolio(
    [
      position(),
      position({ id: 'acc-4:primary', accession: 'acc-4', ticker: 'DDDD', entryDate: '2026-01-05' }),
    ],
    marks,
    'IWM',
  );
  assert.equal(summary.valued, 2);
  // Portfolio return includes the 300% name…
  assert.ok(summary.returnPct! > 1.5);
  // …but alpha only sees AAAA (+20%) against IWM (+5%).
  assert.ok(Math.abs(summary.alphaPct! - 0.15) < 1e-9, `got ${summary.alphaPct}`);
});

test('an empty book summarizes to zeros rather than NaN', () => {
  const s = summarizePortfolio([]);
  assert.equal(s.valued, 0);
  assert.equal(s.costBasis, 0);
  assert.equal(s.returnPct, null);
  assert.equal(s.alphaPct, null);
  assert.equal(s.best, null);
});
