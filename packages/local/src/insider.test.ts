import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { InsiderPurchase } from '@stock-vetter/core';
import { detectInsiderCluster, groupPurchasesByIssuer } from './insider.js';

let seq = 0;
function buy(over: Partial<InsiderPurchase> = {}): InsiderPurchase {
  seq += 1;
  return {
    key: `k${seq}`,
    cik: '0000012345',
    ticker: 'ACME',
    accession: `0000012345-26-00000${seq}`,
    filingDate: '2026-08-06',
    transactionDate: '2026-08-05',
    ownerCik: `owner${seq}`,
    ownerName: `Owner ${seq}`,
    ownerTitle: 'Director',
    isOfficer: false,
    isDirector: true,
    isTenPercentOwner: false,
    shares: 1_000,
    price: 10,
    value: 10_000,
    ...over,
  };
}

test('a lone small director buy clears no bar and produces nothing', () => {
  assert.equal(detectInsiderCluster([buy({ shares: 900, price: 10, value: 9_000 })]), null);
});

test('a single insider above the floor is medium', () => {
  const c = detectInsiderCluster([buy({ value: 40_000 })])!;
  assert.equal(c.severity, 'medium');
  assert.equal(c.buyers, 1);
});

test('two distinct buyers is high, three is critical', () => {
  const two = detectInsiderCluster([buy(), buy()])!;
  assert.equal(two.severity, 'high');
  assert.equal(two.buyers, 2);

  const three = detectInsiderCluster([buy(), buy(), buy()])!;
  assert.equal(three.severity, 'critical');
  assert.equal(three.buyers, 3);
});

test('the same insider buying repeatedly is one buyer, not a cluster', () => {
  // Three filings from one person is a person averaging in, not a management
  // team acting on the same information — the distinction the detector exists for.
  const same = { ownerCik: 'owner-x', value: 40_000 };
  const c = detectInsiderCluster([buy(same), buy(same), buy(same)])!;
  assert.equal(c.buyers, 1);
  // $120k total earns 'high' on the dollar test, but three filings from one
  // person must never reach the 'critical' three-buyers tier.
  assert.equal(c.severity, 'high');
});

test('a large CEO purchase is critical on its own', () => {
  const c = detectInsiderCluster([
    buy({ isOfficer: true, isDirector: false, ownerTitle: 'Chief Executive Officer', value: 300_000 }),
  ])!;
  assert.equal(c.severity, 'critical');
  assert.equal(c.ceoBought, true);
  assert.match(c.headline, /including the CEO/);
});

test('CFO titles are recognised in their common spellings', () => {
  for (const title of ['Chief Financial Officer', 'CFO', 'EVP and Principal Financial Officer']) {
    const c = detectInsiderCluster([buy({ isOfficer: true, ownerTitle: title, value: 300_000 })])!;
    assert.equal(c.cfoBought, true, `title "${title}" should read as CFO`);
  }
});

test('a buy that is large relative to a small market cap escalates on that alone', () => {
  // $120k is not a big cheque, but against a $20M company it is 0.6% of the
  // whole enterprise — which is the test that travels across the watchlist.
  const c = detectInsiderCluster([buy({ value: 120_000 })], { marketCap: 20e6 })!;
  assert.equal(c.severity, 'critical');
  assert.ok(c.fractionOfCap! > 0.005);

  // The same cheque against a $3B company clears nothing on the cap test.
  const big = detectInsiderCluster([buy({ value: 120_000 })], { marketCap: 3e9 })!;
  assert.equal(big.severity, 'high'); // still high on the absolute $100k test
  assert.ok(big.fractionOfCap! < 0.0001);
});

test('purchases with no disclosed price still count as buyers but add no dollars', () => {
  const c = detectInsiderCluster([
    buy({ price: null, value: null }),
    buy({ price: null, value: null }),
  ])!;
  assert.equal(c.buyers, 2);
  assert.equal(c.totalValue, 0);
  assert.equal(c.severity, 'high');
});

test('the cluster reports its window and the filing that revealed it', () => {
  const c = detectInsiderCluster([
    buy({ transactionDate: '2026-07-28', filingDate: '2026-07-29' }),
    buy({ transactionDate: '2026-08-05', filingDate: '2026-08-06', accession: 'latest' }),
  ])!;
  assert.equal(c.firstDate, '2026-07-28');
  assert.equal(c.lastDate, '2026-08-05');
  assert.equal(c.accession, 'latest');
});

test('minPurchaseValue drops the tail without dropping unpriced buys', () => {
  const c = detectInsiderCluster(
    [buy({ value: 5_000 }), buy({ value: 200_000 }), buy({ price: null, value: null })],
    { minPurchaseValue: 10_000 },
  )!;
  assert.equal(c.buyers, 2);
  assert.equal(c.totalValue, 200_000);
});

test('grouping splits purchases by issuer', () => {
  const grouped = groupPurchasesByIssuer([
    buy({ cik: '1' }),
    buy({ cik: '1' }),
    buy({ cik: '2' }),
  ]);
  assert.equal(grouped.size, 2);
  assert.equal(grouped.get('1')!.length, 2);
});
