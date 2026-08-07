// Form 4 (statement of changes in beneficial ownership) → open-market
// insider purchases.
//
// This is the one genuinely BULLISH deterministic signal EDGAR gives you. The
// rest of the radar's detector set is built from disclosures a company makes
// because it has to; a Form 4 with transaction code P is an officer or
// director choosing to put their own money in at a known price, and at
// small-cap scale that is meaningful in a way it isn't at mega caps — the
// insiders there have a real informational edge over a market that isn't
// looking, and the dollar amounts are large relative to the float.
//
// TRANSACTION CODE IS EVERYTHING. Most Form 4s are noise for this purpose:
// code A is a grant (compensation, not conviction), M and X are option
// exercises, F is shares withheld for taxes, S is a sale, G is a gift. Only P
// — an open-market or private purchase — means someone wrote a cheque. A
// detector that counted "insider acquired shares" without reading the code
// would fire on every routine RSU vest in the market and be worse than
// useless.
//
// Fetch strategy: the daily index gives an accession but no document name, and
// resolving one costs a directory listing. The complete-submission text file
// is a single request and contains the XML inline, so that is what this reads.
// Form 4 submissions are ~10-30KB, so the "whole submission" cost is nil.

import { load } from 'cheerio';
import { secFetchTextOrNull } from './sec-http.js';

export type InsiderPurchase = {
  /** Stable identity for dedup across re-sweeps. */
  key: string;
  /** Issuer CIK, zero-padded to 10. */
  cik: string;
  ticker: string;
  accession: string;
  filingDate: string;
  /** Date of the trade itself, which can precede the filing by up to 2 days. */
  transactionDate: string;
  ownerCik: string;
  ownerName: string;
  ownerTitle: string;
  isOfficer: boolean;
  isDirector: boolean;
  isTenPercentOwner: boolean;
  shares: number;
  /** Price per share. Null when the filer left it blank. */
  price: number | null;
  /** shares × price, or null when price is unknown. */
  value: number | null;
};

function accessionNoDashes(accession: string): string {
  return accession.replace(/-/g, '');
}

/** URL of the complete-submission text file for a filing. */
export function submissionTextUrl(cik: string, accession: string): string {
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accessionNoDashes(accession)}/${accession}.txt`;
}

// The submission wraps the ownership XML in SGML document tags. Pulling the
// element out by name is more robust than assuming a document ordering or a
// filename convention, both of which vary by filing agent.
function extractOwnershipXml(submission: string): string | null {
  const m = /<ownershipDocument[\s\S]*?<\/ownershipDocument>/i.exec(submission);
  return m ? m[0] : null;
}

function num(raw: string | undefined): number | null {
  if (raw == null) return null;
  const v = Number(raw.trim());
  return Number.isFinite(v) ? v : null;
}

/**
 * Parse the open-market purchases out of a Form 4's ownership XML.
 *
 * Only non-derivative transactions are read. Derivative purchases (buying
 * warrants or options on the open market) exist but are rare, and their
 * economics depend on strike and expiry in a way a share count doesn't — so
 * counting them alongside common-stock buys would overstate conviction.
 */
export function parseForm4(
  xml: string,
  meta: { cik: string; accession: string; filingDate: string; ticker?: string },
): InsiderPurchase[] {
  const $ = load(xml, { xmlMode: true });

  const ticker =
    meta.ticker ?? $('issuer > issuerTradingSymbol').first().text().trim().toUpperCase() ?? '';

  // A Form 4 can report several owners; take the first relationship block,
  // which is the filer whose transactions the tables describe.
  const rel = $('reportingOwner').first();
  const ownerName = rel.find('rptOwnerName').first().text().trim();
  const ownerCik = rel.find('rptOwnerCik').first().text().trim();
  const flag = (sel: string): boolean => {
    const v = rel.find(sel).first().text().trim().toLowerCase();
    return v === '1' || v === 'true';
  };
  const isOfficer = flag('isOfficer');
  const isDirector = flag('isDirector');
  const isTenPercentOwner = flag('isTenPercentOwner');
  const ownerTitle = rel.find('officerTitle').first().text().trim();

  const out: InsiderPurchase[] = [];
  $('nonDerivativeTransaction').each((_, el) => {
    const t = $(el);
    const code = t.find('transactionCoding > transactionCode').first().text().trim().toUpperCase();
    // P is the whole signal — see the module comment.
    if (code !== 'P') return;
    // Belt and braces: a P coded as a disposition is a data error, not a buy.
    const ad = t
      .find('transactionAmounts > transactionAcquiredDisposedCode > value')
      .first()
      .text()
      .trim()
      .toUpperCase();
    if (ad && ad !== 'A') return;

    const shares = num(t.find('transactionAmounts > transactionShares > value').first().text());
    if (shares == null || shares <= 0) return;
    const price = num(t.find('transactionAmounts > transactionPricePerShare > value').first().text());
    const transactionDate = t.find('transactionDate > value').first().text().trim() || meta.filingDate;

    out.push({
      key: `${meta.accession}:${ownerCik}:${transactionDate}:${shares}`,
      cik: meta.cik.padStart(10, '0'),
      ticker,
      accession: meta.accession,
      filingDate: meta.filingDate,
      transactionDate,
      ownerCik,
      ownerName,
      ownerTitle,
      isOfficer,
      isDirector,
      isTenPercentOwner,
      shares,
      price: price != null && price > 0 ? price : null,
      value: price != null && price > 0 ? shares * price : null,
    });
  });
  return out;
}

/**
 * Fetch and parse one Form 4. Returns [] both when the filing reports no
 * open-market purchases and when the document can't be read — the caller
 * treats the accession as processed either way, so a malformed filing is
 * skipped once rather than retried on every sweep.
 */
export async function fetchForm4Purchases(meta: {
  cik: string;
  accession: string;
  filingDate: string;
  ticker?: string;
}): Promise<InsiderPurchase[]> {
  const body = await secFetchTextOrNull(submissionTextUrl(meta.cik, meta.accession));
  if (!body) return [];
  const xml = extractOwnershipXml(body);
  if (!xml) return [];
  try {
    return parseForm4(xml, meta);
  } catch {
    return [];
  }
}
