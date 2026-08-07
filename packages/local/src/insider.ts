// Insider-buying cluster detection.
//
// A single insider buying $8,000 of stock is not information — it is a
// director topping up after a vest, and a feed that reports it will report
// several a day forever. What carries signal is CONCENTRATION along three
// axes, and the scoring below is built entirely out of them:
//
//   WHO. A CEO or CFO buys with a materially better view of the next two
//   quarters than a non-executive director has. A 10% owner is different
//   again — often a fund averaging down on a position it already holds, which
//   says more about their cost basis than about the business.
//
//   HOW MANY. One buyer is a person. Three buyers inside two weeks is a
//   management team that has seen the same thing. Clustering is the single
//   most useful feature here, and it is why this can't be computed from one
//   filing — it needs a window of them.
//
//   HOW MUCH, RELATIVE TO WHAT. $200k is a rounding error at $50B and a
//   statement at $150M. Both the absolute dollars and the fraction of market
//   cap matter, so both are scored, and the cap-relative test is the one that
//   travels across the watchlist.
//
// Everything here is arithmetic over parsed Form 4 fields. No model.

import type { InsiderPurchase } from '@stock-vetter/core';

export type Severity = 'critical' | 'high' | 'medium' | 'low';

const CEO_RE = /chief\s+executive|\bceo\b|president\s+and\s+chief/i;
const CFO_RE = /chief\s+financial|\bcfo\b|principal\s+financial/i;

export type InsiderCluster = {
  ticker: string;
  cik: string;
  /** Distinct reporting owners who bought in the window. */
  buyers: number;
  /** Purchases with a usable price; the basis for `totalValue`. */
  pricedPurchases: number;
  totalShares: number;
  /** Sum of shares × price over purchases that disclosed a price. */
  totalValue: number;
  /** totalValue / marketCap, or null when the watchlist carried no cap. */
  fractionOfCap: number | null;
  ceoBought: boolean;
  cfoBought: boolean;
  /** Earliest and latest trade dates in the window. */
  firstDate: string;
  lastDate: string;
  /** The filing that made this cluster visible — the most recent Form 4. */
  accession: string;
  filingDate: string;
  severity: Severity;
  headline: string;
  detail: string;
};

export type ClusterOptions = {
  /** Market cap for the cap-relative tests. */
  marketCap?: number | null;
  /**
   * Ignore purchases below this dollar value. Set above zero to suppress the
   * long tail of token buys that clear no bar on any axis.
   */
  minPurchaseValue?: number;
};

function isCeo(p: InsiderPurchase): boolean {
  return p.isOfficer && CEO_RE.test(p.ownerTitle);
}

function isCfo(p: InsiderPurchase): boolean {
  return p.isOfficer && CFO_RE.test(p.ownerTitle);
}

function money(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}k`;
  return `$${Math.round(n)}`;
}

/**
 * Score one issuer's window of insider purchases into a signal, or null when
 * the window clears no bar.
 *
 * The severity ladder, in the order it is tested:
 *   critical — 3+ distinct buyers, or ≥$250k of CEO/CFO buying, or ≥0.5% of
 *              the market cap bought.
 *   high     — 2+ distinct buyers, or ≥$100k bought in total, or ≥0.2% of cap.
 *   medium   — ≥$25k bought in total.
 * Below that: nothing. The floor exists so the feed stays readable; a $9k
 * director buy is not a reason to look at a company.
 */
export function detectInsiderCluster(
  purchases: InsiderPurchase[],
  opts: ClusterOptions = {},
): InsiderCluster | null {
  const minValue = opts.minPurchaseValue ?? 0;
  // A purchase with no disclosed price still evidences a buy; it just can't
  // contribute dollars. Keep it for the buyer count, exclude it from the value
  // tests rather than assuming a price.
  const kept = purchases.filter((p) => (p.value == null ? true : p.value >= minValue));
  if (!kept.length) return null;

  const priced = kept.filter((p) => p.value != null);
  const totalValue = priced.reduce((a, p) => a + (p.value ?? 0), 0);
  const totalShares = kept.reduce((a, p) => a + p.shares, 0);
  const buyers = new Set(kept.map((p) => p.ownerCik || p.ownerName)).size;
  const ceoBought = kept.some(isCeo);
  const cfoBought = kept.some(isCfo);

  const cap = opts.marketCap != null && opts.marketCap > 0 ? opts.marketCap : null;
  const fractionOfCap = cap ? totalValue / cap : null;

  const execValue = kept
    .filter((p) => isCeo(p) || isCfo(p))
    .reduce((a, p) => a + (p.value ?? 0), 0);

  // The dollar tests read TOTAL committed, not the largest single ticket. One
  // insider buying $50k three times has put $150k in, and treating that as a
  // $50k event because no single filing was large would understate exactly the
  // pattern — a repeat buyer scaling in — that is worth noticing.
  let severity: Severity | null = null;
  if (buyers >= 3 || execValue >= 250e3 || (fractionOfCap != null && fractionOfCap >= 0.005)) {
    severity = 'critical';
  } else if (buyers >= 2 || totalValue >= 100e3 || (fractionOfCap != null && fractionOfCap >= 0.002)) {
    severity = 'high';
  } else if (totalValue >= 25e3) {
    severity = 'medium';
  }
  if (!severity) return null;

  const dates = kept.map((p) => p.transactionDate).sort();
  const latest = [...kept].sort((a, b) => b.filingDate.localeCompare(a.filingDate))[0]!;

  const who: string[] = [];
  if (ceoBought) who.push('CEO');
  if (cfoBought) who.push('CFO');
  const roleNote = who.length ? ` including the ${who.join(' and ')}` : '';
  const capNote =
    fractionOfCap != null ? ` (${(fractionOfCap * 100).toFixed(2)}% of market cap)` : '';

  return {
    ticker: latest.ticker,
    cik: latest.cik,
    buyers,
    pricedPurchases: priced.length,
    totalShares,
    totalValue,
    fractionOfCap,
    ceoBought,
    cfoBought,
    firstDate: dates[0]!,
    lastDate: dates.at(-1)!,
    accession: latest.accession,
    filingDate: latest.filingDate,
    severity,
    headline:
      `${buyers} insider${buyers === 1 ? '' : 's'} bought ${money(totalValue)} on the open market` +
      `${roleNote}${capNote}`,
    detail:
      kept
        .slice()
        .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate))
        .map(
          (p) =>
            `${p.transactionDate} ${p.ownerName}${p.ownerTitle ? ` (${p.ownerTitle})` : ''} ` +
            `${Math.round(p.shares).toLocaleString('en-US')} sh` +
            `${p.price != null ? ` @ $${p.price.toFixed(2)} = ${money(p.value ?? 0)}` : ' (price not disclosed)'}`,
        )
        .join('; ') +
      `. Open-market purchases only (Form 4 transaction code P) — grants, option exercises and ` +
      `tax withholding are excluded.`,
  };
}

/** Group purchases by issuer CIK, for scoring one cluster per company. */
export function groupPurchasesByIssuer(
  purchases: InsiderPurchase[],
): Map<string, InsiderPurchase[]> {
  const byCik = new Map<string, InsiderPurchase[]>();
  for (const p of purchases) {
    const list = byCik.get(p.cik);
    if (list) list.push(p);
    else byCik.set(p.cik, [p]);
  }
  return byCik;
}
