import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RadarRow } from '@/radar-queries';
import { suggest, filterByTicker } from './suggest';

let n = 0;
function row(ticker: string, over: Partial<RadarRow> = {}): RadarRow {
  n += 1;
  return {
    key: `k${n}`,
    ticker,
    cik: '0000012345',
    accession: `0000012345-26-00000${n}`,
    form: '10-Q',
    filingDate: '2026-08-04',
    kind: 'trend',
    severity: 'medium',
    direction: 'bearish',
    headline: 'Gross margin fell…',
    detail: '',
    marketCap: 5e8,
    focus: false,
    firstSeenAt: '2026-08-04',
    jobStatus: null,
    verdict: null,
    conviction: null,
    altVerdict: null,
    ...over,
  };
}

// A realistic slice of the feed: a shared "TB" prefix across two tickers, plus
// one that only *contains* those letters.
const rows = [
  row('TBCH'),
  row('TBCH'),
  row('TBLA'),
  row('TBLA'),
  row('TBLA'),
  row('SLDP'),
  row('SHLS', { focus: true, marketCap: 1.5e9 }),
  row('ZIP'),
  row('OTBX'),
];

test('prefix matches rank above substring-only matches', () => {
  // The whole point of the ordering: typing "TB" must offer TBLA/TBCH before
  // OTBX, which merely contains the letters.
  assert.deepEqual(
    suggest(rows, 'TB').map((s) => s.ticker),
    ['TBLA', 'TBCH', 'OTBX'],
  );
});

test('within a tier, the noisiest ticker comes first', () => {
  const [first, second] = suggest(rows, 'TB');
  assert.equal(first!.ticker, 'TBLA');
  assert.equal(first!.count, 3, 'counts aggregate across a ticker’s signals');
  assert.equal(second!.count, 2);
});

test('matching is case-insensitive and tolerates stray whitespace', () => {
  assert.deepEqual(suggest(rows, '  tbla ').map((s) => s.ticker), ['TBLA']);
});

test('suggestions carry the badges the dropdown renders', () => {
  const shls = suggest(rows, 'SHLS')[0]!;
  assert.equal(shls.focus, true);
  assert.equal(shls.marketCap, 1.5e9);
});

test('an empty or unmatched query offers nothing', () => {
  assert.deepEqual(suggest(rows, ''), []);
  assert.deepEqual(suggest(rows, '   '), []);
  assert.deepEqual(suggest(rows, 'NOPE'), []);
});

test('the suggestion list is capped', () => {
  assert.equal(suggest(rows, 'T', 2).length, 2);
});

test('a ticker on the focus list anywhere marks the whole suggestion', () => {
  // One starred signal is enough — the dropdown shows the ★ per ticker, not
  // per signal, so a mixed set must still surface it.
  const mixed = [row('MIXD'), row('MIXD', { focus: true })];
  assert.equal(suggest(mixed, 'MIXD')[0]!.focus, true);
});

// --- filtering -------------------------------------------------------------

test('filtering returns every signal for a matched ticker', () => {
  assert.equal(filterByTicker(rows, 'TBLA').length, 3);
  assert.equal(filterByTicker(rows, 'tbla').length, 3, 'case-insensitive');
});

test('an empty query filters nothing out', () => {
  assert.equal(filterByTicker(rows, '').length, rows.length);
  assert.equal(filterByTicker(rows, '  ').length, rows.length);
});

test('a partial query matches every ticker containing it', () => {
  // "TB" spans TBCH (2) + TBLA (3) + OTBX (1).
  assert.equal(filterByTicker(rows, 'TB').length, 6);
});
