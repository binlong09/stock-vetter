#!/usr/bin/env tsx
/**
 * scripts/add-watchlist.ts
 *
 * Append tickers to an existing data/watchlist.json without touching the
 * entries already there (unlike build-watchlist, which rebuilds the file from
 * scratch). Tickers already on the list are skipped; new ones get their CIK
 * resolved from EDGAR — the load-bearing field the daily-index sweep joins on.
 *
 *   pnpm add-watchlist TSLA AMZN
 *   pnpm add-watchlist TSLA --file=data/watchlist.json
 */
import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { resolveCik } from '@stock-vetter/core';

const args = process.argv.slice(2);
const file = args.find((a) => a.startsWith('--file='))?.split('=')[1] ?? 'data/watchlist.json';
const tickers = args.filter((a) => !a.startsWith('--')).map((t) => t.toUpperCase());

interface WatchlistEntry {
  ticker: string;
  cik: string;
}

async function main(): Promise<void> {
  if (!tickers.length) {
    process.stderr.write('Usage: pnpm add-watchlist TICKER [TICKER...] [--file=path]\n');
    process.exit(1);
  }
  // Tolerate a UTF-8 BOM — Windows editors add one, and JSON.parse rejects it.
  const raw = await readFile(file, 'utf-8');
  const doc = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw) as {
    tickers?: WatchlistEntry[];
    [k: string]: unknown;
  };
  const entries = doc.tickers ?? [];
  const have = new Set(entries.map((e) => e.ticker.toUpperCase()));

  let added = 0;
  for (const ticker of [...new Set(tickers)]) {
    if (have.has(ticker)) {
      process.stderr.write(`  ${ticker.padEnd(6)} already on the list — skipped\n`);
      continue;
    }
    try {
      const cik = await resolveCik(ticker);
      entries.push({ ticker, cik });
      added += 1;
      process.stderr.write(`  ${ticker.padEnd(6)} → CIK ${cik}\n`);
    } catch (e) {
      process.stderr.write(`  ${ticker.padEnd(6)} FAILED: ${(e as Error).message}\n`);
    }
  }
  if (!added) {
    process.stderr.write(`\nnothing to add — ${file} unchanged (${entries.length} tickers)\n`);
    return;
  }
  doc.tickers = entries;
  doc.count = entries.length;
  await writeFile(file, JSON.stringify(doc, null, 2) + '\n', 'utf-8');
  process.stderr.write(`\nadded ${added} ticker(s) — ${file} now has ${entries.length}\n`);
}

main().catch((e) => {
  process.stderr.write(`${(e as Error).stack ?? e}\n`);
  process.exit(1);
});
