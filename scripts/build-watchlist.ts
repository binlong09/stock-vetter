#!/usr/bin/env tsx
/**
 * scripts/build-watchlist.ts
 *
 * Build data/watchlist.json (universe-shaped {tickers:[{ticker,cik}]}) from
 * tickers given on the command line. CIK is resolved from EDGAR — it is the
 * load-bearing field the daily-index sweep joins on.
 *
 *   pnpm build-watchlist AAPL MSFT NVDA
 *   pnpm build-watchlist AAPL MSFT --out=data/watchlist.json
 */
import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { resolveCik } from '@stock-vetter/core';

const args = process.argv.slice(2);
const out = args.find((a) => a.startsWith('--out='))?.split('=')[1] ?? 'data/watchlist.json';
const tickers = args.filter((a) => !a.startsWith('--')).map((t) => t.toUpperCase());

async function main(): Promise<void> {
  if (!tickers.length) {
    process.stderr.write('Usage: pnpm build-watchlist TICKER [TICKER...] [--out=path]\n');
    process.exit(1);
  }
  const entries: Array<{ ticker: string; cik: string }> = [];
  for (const ticker of tickers) {
    try {
      const cik = await resolveCik(ticker);
      entries.push({ ticker, cik });
      process.stderr.write(`  ${ticker.padEnd(6)} → CIK ${cik}\n`);
    } catch (e) {
      process.stderr.write(`  ${ticker.padEnd(6)} FAILED: ${(e as Error).message}\n`);
    }
  }
  const doc = {
    _doc: 'Radar watchlist. Regenerate with: pnpm build-watchlist TICKER...',
    count: entries.length,
    tickers: entries,
  };
  await writeFile(out, JSON.stringify(doc, null, 2) + '\n', 'utf-8');
  process.stderr.write(`\nwrote ${entries.length}/${tickers.length} tickers to ${out}\n`);
}

main().catch((e) => {
  process.stderr.write(`${(e as Error).stack ?? e}\n`);
  process.exit(1);
});
