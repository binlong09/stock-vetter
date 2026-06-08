#!/usr/bin/env tsx
/**
 * scripts/verify-parser.ts
 *
 * Parser byte-identity harness. Fetches a filing's raw HTML directly from SEC,
 * parses it with parseFiling (bypassing the on-disk cache), and prints a SHA256
 * over the parsed output (section ids, item numbers, char lengths, confidence,
 * chosen-anchor text, and the section BODIES). Run before and after a parser
 * change to prove 10-K output is byte-identical.
 *
 * Usage:
 *   pnpm tsx scripts/verify-parser.ts NVDA 10-K
 *   pnpm tsx scripts/verify-parser.ts MSFT 10-Q
 */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { parseFiling, TENK_ITEMS, TENQ_ITEMS } from '@stock-vetter/core';

const SEC_USER_AGENT =
  process.env.SEC_USER_AGENT ?? 'stock-vetter (https://example.com / contact@example.com)';

async function tickerToCik(ticker: string): Promise<string> {
  const res = await fetch('https://www.sec.gov/files/company_tickers.json', {
    headers: { 'User-Agent': SEC_USER_AGENT },
  });
  const json = (await res.json()) as Record<string, { cik_str: number; ticker: string }>;
  for (const v of Object.values(json)) {
    if (v.ticker.toUpperCase() === ticker.toUpperCase()) return String(v.cik_str).padStart(10, '0');
  }
  throw new Error(`ticker not found: ${ticker}`);
}

async function latestFiling(cik: string, form: string) {
  const res = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
    headers: { 'User-Agent': SEC_USER_AGENT },
  });
  const sub = (await res.json()) as {
    filings: { recent: { accessionNumber: string[]; form: string[]; primaryDocument: string[]; filingDate: string[] } };
  };
  const r = sub.filings.recent;
  for (let i = 0; i < r.form.length; i++) {
    if (r.form[i] === form) {
      return { accession: r.accessionNumber[i]!, primaryDoc: r.primaryDocument[i]!, filingDate: r.filingDate[i]! };
    }
  }
  throw new Error(`no ${form} for CIK ${cik}`);
}

async function main() {
  const [ticker, form] = process.argv.slice(2);
  if (!ticker || (form !== '10-K' && form !== '10-Q')) {
    console.error('Usage: pnpm tsx scripts/verify-parser.ts <TICKER> <10-K|10-Q>');
    process.exit(1);
  }
  const cik = await tickerToCik(ticker);
  const f = await latestFiling(cik, form);
  const cikInt = String(parseInt(cik, 10));
  const url = `https://www.sec.gov/Archives/edgar/data/${cikInt}/${f.accession.replace(/-/g, '')}/${f.primaryDoc}`;
  const html = await (await fetch(url, { headers: { 'User-Agent': SEC_USER_AGENT } })).text();

  const items = form === '10-K' ? TENK_ITEMS : TENQ_ITEMS;
  const result = parseFiling(html, items);

  // Canonical, order-stable projection of everything that matters downstream.
  const canonical = {
    form,
    accession: f.accession,
    cleanedTextLength: result.cleanedTextLength,
    missing: [...result.missing].sort(),
    parserWarnings: [...result.parserWarnings].sort(),
    sections: [...result.sections]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((s) => ({
        id: s.id,
        itemNumber: s.itemNumber,
        charLength: s.charLength,
        confidence: s.confidence,
        warnings: s.warnings,
        bundled: s.bundled ?? null,
        anchorText: s.chosenAnchor.text,
        // Body hash, not body, to keep output compact but byte-sensitive.
        bodyHash: createHash('sha256').update(s.body).digest('hex'),
      })),
  };
  const hash = createHash('sha256').update(JSON.stringify(canonical)).digest('hex');

  // Human-readable per-section line + the overall hash (the byte-identity gate).
  for (const s of canonical.sections) {
    console.log(`${s.id.padEnd(22)} item=${s.itemNumber.padEnd(3)} len=${String(s.charLength).padStart(7)} ${s.confidence.padEnd(7)} body=${s.bodyHash.slice(0, 12)} anchor="${s.anchorText.slice(0, 50)}"`);
  }
  console.log(`MISSING: ${canonical.missing.join(',') || '(none)'}`);
  console.log(`PARSE_HASH ${form} ${ticker} ${hash}`);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
