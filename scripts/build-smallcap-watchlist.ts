#!/usr/bin/env tsx
/**
 * scripts/build-smallcap-watchlist.ts
 *
 * Build the small-cap tech watchlist the radar sweeps.
 *
 * The premise: the top ~100 large-cap tech names are the most heavily
 * analyzed securities in existence. Every 8-K is read by a hundred funds
 * within seconds of hitting the wire, and a deterministic EDGAR scanner adds
 * nothing to that. Two orders of magnitude down the cap scale, coverage
 * collapses — a $250M company has no sell-side analyst, its filings are read
 * by almost nobody on the day, and the same deterministic tells (a shelf
 * takedown, a listing deficiency, a 40% jump in share count) are still there
 * and still move the stock. That gap is the entire thesis of this watchlist.
 *
 * Three things get cut, in this order, because each one is cheaper than the
 * next:
 *
 *   1. SIZE. Market cap inside the band. One batched quote request per 40
 *      symbols covers every registrant.
 *   2. TRADABILITY. Price above a floor and average dollar volume above a
 *      floor. This is the filter that separates a small-cap universe from a
 *      list of things you cannot actually trade — see market-screen.ts.
 *   3. SECTOR. SIC code in the tech set, from EDGAR. One request per company,
 *      so it runs LAST, over the few hundred names that survived 1 and 2.
 *
 * Slow (several minutes) and worth re-running weekly at most — the membership
 * of a cap band does not change daily. Quotes and SIC lookups are both cached,
 * so an interrupted run resumes rather than restarting.
 *
 * Usage:
 *   pnpm build-smallcap                              # $50M–$2B tech → data/watchlist-smallcap.json
 *   pnpm build-smallcap --min-cap=100e6 --max-cap=1e9
 *   pnpm build-smallcap --min-dollar-volume=2e6      # stricter tradability floor
 *   pnpm build-smallcap --include-sic=4813,8731      # widen the sector set
 *   pnpm build-smallcap --pin=RKLB,SPCX              # always keep these names
 *   pnpm build-smallcap --max-names=400              # cap the list (keeps the most liquid)
 *   pnpm build-smallcap --resume                     # continue from the caches
 */
import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  allTickerCiks,
  screenQuotes,
  fetchBusinessSummary,
  fetchCompanyProfile,
  techSicLabel,
  parseSicRanges,
  sicInRanges,
  type ScreenQuote,
} from '@stock-vetter/core';

const argv = process.argv.slice(2);
const flag = (n: string): string | undefined => {
  const hit = argv.find((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  return hit ? (hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : 'true') : undefined;
};
// Accepts 5e8 / 500e6 / 500000000 — the exponent forms are much easier to read
// (and get right) at these magnitudes.
const num = (n: string, dflt: number): number => {
  const raw = flag(n);
  if (raw == null) return dflt;
  const v = Number(raw);
  if (!Number.isFinite(v)) throw new Error(`--${n} must be a number, got "${raw}"`);
  return v;
};
const list = (n: string): string[] =>
  (flag(n) ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);

const MIN_CAP = num('min-cap', 50e6);
const MAX_CAP = num('max-cap', 2e9);
const MIN_PRICE = num('min-price', 1);
const MIN_DOLLAR_VOLUME = num('min-dollar-volume', 1e6);
// SIC classification is one EDGAR request per company. Bound it so a widened
// cap band can't turn a weekly job into an hour of EDGAR traffic; the cut is
// by dollar volume, so what gets dropped is the least tradable tail.
const MAX_PROBE = num('max-probe', 1500);
const MAX_NAMES = num('max-names', Infinity);
const OUT = flag('out') ?? 'data/watchlist-smallcap.json';
const PINNED = list('pin');

const QUOTE_CACHE = '.cache/smallcap-quotes.json';
const SIC_CACHE = '.cache/smallcap-sic.json';
const DESC_CACHE = '.cache/smallcap-desc.json';

type SicRow = { cik: string; name: string; sic: string; sicDescription: string; exchanges: string[] };

async function loadCache<T>(path: string): Promise<T[]> {
  if (flag('resume') == null) return [];
  try {
    return JSON.parse(await readFile(path, 'utf-8')) as T[];
  } catch {
    return [];
  }
}

async function saveCache(path: string, rows: unknown[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(rows), 'utf-8');
}

function fmtCap(n: number | null): string {
  if (n == null) return 'n/a';
  return n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : `$${(n / 1e6).toFixed(0)}M`;
}

async function main(): Promise<void> {
  if (MIN_CAP >= MAX_CAP) throw new Error(`--min-cap (${MIN_CAP}) must be below --max-cap (${MAX_CAP})`);
  const extraSic = flag('include-sic') ? parseSicRanges(flag('include-sic')!) : [];

  process.stdout.write('fetching SEC ticker → CIK table…\n');
  const tickerCiks = await allTickerCiks();
  const symbols = [...tickerCiks.keys()]
    // Class shares and units use dots/hyphens in SEC's list and carets in
    // Yahoo's; rather than guess at the mapping, skip them. Losing a handful
    // of dual-class B shares beats silently pricing the wrong security.
    .filter((s) => /^[A-Z]{1,5}$/.test(s));
  process.stdout.write(`${symbols.length} plain-symbol registrants to price\n`);

  // --- 1. price everything -------------------------------------------------
  const cached = await loadCache<ScreenQuote>(QUOTE_CACHE);
  if (cached.length) process.stdout.write(`resuming with ${cached.length} cached quotes\n`);
  const have = new Set(cached.map((q) => q.ticker));
  const quotes = [...cached];
  const todo = symbols.filter((s) => !have.has(s));

  await screenQuotes(todo, {
    onBatch: (rows) => {
      quotes.push(...rows);
    },
    onProgress: async (done, total) => {
      process.stdout.write(`\r  priced ${done}/${total}`);
      if (done % 400 === 0 || done === total) await saveCache(QUOTE_CACHE, quotes);
    },
    onBatchError: (batch, e) => {
      process.stderr.write(`\n  batch ${batch[0]}… failed: ${e.message}\n`);
    },
  });
  await saveCache(QUOTE_CACHE, quotes);
  process.stdout.write('\n');

  // --- 2. size + tradability ----------------------------------------------
  const isPinned = (t: string): boolean => PINNED.includes(t);
  const tradable = quotes.filter((q) => {
    if (isPinned(q.ticker)) return true;
    // ETFs and closed-end funds file with the SEC and carry a market cap; they
    // are not companies and have no 8-Ks worth reading.
    if (q.quoteType && q.quoteType !== 'EQUITY') return false;
    if (q.marketCap == null || q.marketCap < MIN_CAP || q.marketCap > MAX_CAP) return false;
    if (q.price == null || q.price < MIN_PRICE) return false;
    if (q.avgDollarVolume == null || q.avgDollarVolume < MIN_DOLLAR_VOLUME) return false;
    return true;
  });
  process.stdout.write(
    `${tradable.length} names inside ${fmtCap(MIN_CAP)}–${fmtCap(MAX_CAP)} ` +
      `with price ≥ $${MIN_PRICE} and ≥ $${(MIN_DOLLAR_VOLUME / 1e6).toFixed(1)}M/day of volume\n`,
  );

  // --- 3. sector, over the survivors only ----------------------------------
  const probe = [...tradable]
    .sort((a, b) => (b.avgDollarVolume ?? 0) - (a.avgDollarVolume ?? 0))
    .slice(0, MAX_PROBE);
  if (probe.length < tradable.length) {
    process.stdout.write(
      `  classifying the ${probe.length} most liquid of them (--max-probe); ` +
        `${tradable.length - probe.length} thinner names skipped\n`,
    );
  }

  const sicCache = new Map((await loadCache<SicRow>(SIC_CACHE)).map((r) => [r.cik, r]));
  const sicRows: SicRow[] = [...sicCache.values()];
  let done = 0;
  for (const q of probe) {
    const cik = tickerCiks.get(q.ticker);
    if (!cik) continue;
    done++;
    if (!sicCache.has(cik)) {
      try {
        const p = await fetchCompanyProfile(cik);
        const row: SicRow = {
          cik: p.cik,
          name: p.name,
          sic: p.sic,
          sicDescription: p.sicDescription,
          exchanges: p.exchanges,
        };
        sicCache.set(cik, row);
        sicRows.push(row);
      } catch (e) {
        // A profile we can't fetch is a name we can't classify; it drops out
        // rather than being guessed into the universe.
        process.stderr.write(`\n  ${q.ticker} profile failed: ${(e as Error).message}\n`);
      }
      if (done % 100 === 0) await saveCache(SIC_CACHE, sicRows);
    }
    process.stdout.write(`\r  classified ${done}/${probe.length}`);
  }
  await saveCache(SIC_CACHE, sicRows);
  process.stdout.write('\n');

  const entries = probe
    .map((q) => {
      const cik = tickerCiks.get(q.ticker)!;
      const profile = sicCache.get(cik);
      const label = profile ? techSicLabel(profile.sic) : null;
      const included =
        label != null || (profile != null && extraSic.length > 0 && sicInRanges(profile.sic, extraSic));
      if (!included && !isPinned(q.ticker)) return null;
      return {
        ticker: q.ticker,
        cik,
        // Prefer Yahoo's name: it's properly cased ("PAR Technology Corp"),
        // where EDGAR's registrant name is shouted legal boilerplate
        // ("PAR TECHNOLOGY CORP /DE/"). The feed displays this string.
        name: q.name ?? profile?.name ?? '',
        marketCap: q.marketCap,
        avgDollarVolume: q.avgDollarVolume,
        sic: profile?.sic ?? '',
        sicDescription: profile?.sicDescription ?? '',
        sector: label ?? (isPinned(q.ticker) ? 'pinned' : 'included by --include-sic'),
        description: null as string | null,
      };
    })
    .filter((e): e is NonNullable<typeof e> => e != null)
    .sort((a, b) => (b.avgDollarVolume ?? 0) - (a.avgDollarVolume ?? 0))
    .slice(0, Number.isFinite(MAX_NAMES) ? MAX_NAMES : undefined);

  // --- 4. business descriptions, over the final list only -------------------
  // One quoteSummary request per surviving name — the same order of traffic as
  // the SIC stage. A name whose profile fails stays description-less (the feed
  // falls back to the SIC industry label) rather than dropping out: identity
  // is a nicety, membership is the product.
  type DescRow = { ticker: string; description: string | null };
  const descCache = new Map((await loadCache<DescRow>(DESC_CACHE)).map((r) => [r.ticker, r]));
  const descRows: DescRow[] = [...descCache.values()];
  let described = 0;
  for (const e of entries) {
    described++;
    if (!descCache.has(e.ticker)) {
      try {
        const row: DescRow = { ticker: e.ticker, description: await fetchBusinessSummary(e.ticker) };
        descCache.set(e.ticker, row);
        descRows.push(row);
      } catch {
        // Transport blip: leave it out of the cache so --resume retries it.
      }
      if (described % 50 === 0) await saveCache(DESC_CACHE, descRows);
    }
    e.description = descCache.get(e.ticker)?.description ?? null;
    process.stdout.write(`\r  described ${described}/${entries.length}`);
  }
  await saveCache(DESC_CACHE, descRows);
  process.stdout.write('\n');

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(
    OUT,
    JSON.stringify(
      {
        _doc:
          'Small-cap tech watchlist for the radar. Rebuilt with `pnpm build-smallcap`. ' +
          'The radar joins EDGAR daily-index entries on `cik`, and uses `marketCap` to ' +
          'decide what counts as material (an 8-K item that is noise at $500B is a ' +
          'repricing event at $200M).',
        builtAt: new Date().toISOString(),
        filters: {
          marketCap: [MIN_CAP, MAX_CAP],
          minPrice: MIN_PRICE,
          minAvgDollarVolume: MIN_DOLLAR_VOLUME,
          sic: 'tech set (packages/core/src/sec-sic.ts)' + (flag('include-sic') ? ` + ${flag('include-sic')}` : ''),
          pinned: PINNED,
        },
        count: entries.length,
        tickers: entries,
      },
      null,
      2,
    ) + '\n',
    'utf-8',
  );

  const caps = entries.map((e) => e.marketCap ?? 0).sort((a, b) => a - b);
  const median = caps.length ? caps[Math.floor(caps.length / 2)]! : 0;
  process.stdout.write(
    `\nwrote ${entries.length} small-cap tech names to ${OUT}\n` +
      `  median cap:   ${fmtCap(median)}\n` +
      `  smallest:     ${entries.at(-1)?.ticker} ${fmtCap(entries.at(-1)?.marketCap ?? null)}\n` +
      `  most liquid:  ${entries[0]?.ticker} ($${((entries[0]?.avgDollarVolume ?? 0) / 1e6).toFixed(1)}M/day)\n`,
  );
  if (!entries.length) {
    process.stderr.write('No names passed the filters — widen --min-cap/--max-cap or lower --min-dollar-volume.\n');
    process.exitCode = 1;
  }
}

main().catch((e) => {
  process.stderr.write(`${(e as Error).stack ?? e}\n`);
  process.exit(1);
});
