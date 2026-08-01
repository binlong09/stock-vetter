#!/usr/bin/env tsx
/**
 * scripts/build-universe.ts
 *
 * Build the top-N-by-market-cap universe the scanner sweeps.
 *
 * SEC's ticker file gives every registrant with a CIK (~10,000 of them) but no
 * market cap; Yahoo gives market cap but doesn't know about CIKs. So: take the
 * SEC list, price it through Yahoo in batches, sort, and keep the top N. The
 * CIK is what actually matters downstream — the daily-index sweep joins on it.
 *
 * This is slow (a few minutes) and worth re-running weekly at most; the
 * membership of the top 2,000 does not change daily. Partial progress is
 * written as it goes, so an interrupted run resumes rather than restarting.
 *
 * Usage:
 *   pnpm build-universe                    # top 2000 → data/universe.json
 *   pnpm build-universe --top=500
 *   pnpm build-universe --out=data/small.json
 *   pnpm build-universe --resume           # continue from the cache
 */
import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { allTickerCiks } from '@stock-vetter/core';

const argv = process.argv.slice(2);
const flag = (n: string): string | undefined => {
  const hit = argv.find((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  return hit ? (hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : 'true') : undefined;
};

const TOP = Number(flag('top') ?? 2000);
const OUT = flag('out') ?? 'data/universe.json';
const CACHE = '.cache/universe-quotes.json';
const BATCH = 40;

type QuoteRow = { ticker: string; cik: string; marketCap: number | null; name?: string };

async function loadCache(): Promise<Map<string, QuoteRow>> {
  if (flag('resume') == null) return new Map();
  try {
    const rows = JSON.parse(await readFile(CACHE, 'utf-8')) as QuoteRow[];
    process.stdout.write(`resuming with ${rows.length} cached quotes\n`);
    return new Map(rows.map((r) => [r.ticker, r]));
  } catch {
    return new Map();
  }
}

async function main(): Promise<void> {
  const yahooFinance = (await import('yahoo-finance2')).default;
  // Yahoo's survey notice prints on every call; over 250 batches that buries
  // the progress line. Suppressing is cosmetic and version-dependent, so it's
  // guarded rather than assumed.
  (yahooFinance as unknown as { suppressNotices?: (n: string[]) => void }).suppressNotices?.(['yahooSurvey']);

  process.stdout.write('fetching SEC ticker → CIK table…\n');
  const tickerCiks = await allTickerCiks();
  const symbols = [...tickerCiks.keys()]
    // Class shares and units use dots/hyphens in SEC's list and carets in
    // Yahoo's; rather than guess at the mapping, skip them. Losing a handful
    // of dual-class B shares beats silently pricing the wrong security.
    .filter((s) => /^[A-Z]{1,5}$/.test(s));
  process.stdout.write(`${symbols.length} plain-symbol registrants to price\n`);

  const cache = await loadCache();
  const rows: QuoteRow[] = [...cache.values()];
  const todo = symbols.filter((s) => !cache.has(s));

  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    try {
      const quotes = await yahooFinance.quote(batch);
      const list = Array.isArray(quotes) ? quotes : [quotes];
      for (const q of list) {
        const sym = (q as { symbol?: string }).symbol;
        if (!sym) continue;
        const cik = tickerCiks.get(sym.toUpperCase());
        if (!cik) continue;
        rows.push({
          ticker: sym.toUpperCase(),
          cik,
          marketCap: (q as { marketCap?: number }).marketCap ?? null,
          name: (q as { longName?: string; shortName?: string }).longName ?? (q as { shortName?: string }).shortName,
        });
      }
    } catch (e) {
      // A batch containing one delisted symbol can fail wholesale. Losing 40
      // names out of 10,000 does not change the top 2,000.
      process.stderr.write(`  batch ${i}-${i + batch.length} failed: ${(e as Error).message}\n`);
    }
    const done = Math.min(i + BATCH, todo.length);
    process.stdout.write(`\r  priced ${done}/${todo.length}`);
    if (done % (BATCH * 10) === 0 || done === todo.length) {
      await mkdir(dirname(CACHE), { recursive: true });
      await writeFile(CACHE, JSON.stringify(rows), 'utf-8');
    }
  }
  process.stdout.write('\n');

  const ranked = rows
    .filter((r) => r.marketCap != null && r.marketCap > 0)
    .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))
    .slice(0, TOP);

  if (ranked.length < TOP) {
    process.stderr.write(
      `WARNING: only ${ranked.length} of ${TOP} requested names have a market cap. ` +
        `Re-run with --resume to fill in failed batches.\n`,
    );
  }

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(
    OUT,
    JSON.stringify(
      {
        _doc:
          'Universe for the short-side scanner, top N US registrants by market cap. ' +
          'Rebuilt with `pnpm build-universe`. The scanner joins EDGAR daily-index ' +
          'entries on `cik`, so that field is the one that matters.',
        builtAt: new Date().toISOString(),
        count: ranked.length,
        tickers: ranked.map((r) => ({
          ticker: r.ticker,
          cik: r.cik,
          name: r.name,
          marketCap: r.marketCap,
        })),
      },
      null,
      2,
    ),
    'utf-8',
  );

  const smallest = ranked.at(-1);
  process.stdout.write(
    `wrote ${ranked.length} companies to ${OUT}\n` +
      `  largest:  ${ranked[0]?.ticker} ($${((ranked[0]?.marketCap ?? 0) / 1e9).toFixed(1)}B)\n` +
      `  smallest: ${smallest?.ticker} ($${((smallest?.marketCap ?? 0) / 1e9).toFixed(2)}B)\n`,
  );
}

main().catch((e) => {
  process.stderr.write(`${(e as Error).stack ?? e}\n`);
  process.exit(1);
});
