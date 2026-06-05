#!/usr/bin/env tsx
/**
 * scripts/track.ts — Signal Tracker orchestrator (Phase 1: ingestion + diff,
 * NO LLM).
 *
 * For each thesis in data/theses.json:
 *   1. gather candidate Events for the thesis's tickers (SEC 8-K/10-Q/10-K +
 *      FMP annual consensus + FMP ratings-bull-index), via packages/signals,
 *   2. diff them against the thesis's cursor (last-seen state under
 *      .cache/signals/), and
 *   3. print the NEW events since the last run.
 * Then advance + persist the cursor (unless --dry-run).
 *
 * Manual watch-items (e.g. TSMC capex, a foreign filer not on EDGAR/Starter)
 * are NOT fetched — they're surfaced from data/manual-events.json if present
 * (an array of toManualEvent inputs), so the schema supports them without
 * requiring a feed.
 *
 * Usage:
 *   pnpm track                     # all theses; advances cursors
 *   pnpm track NVDA-margin-durability   # one thesis by id
 *   pnpm track --dry-run           # print new events but DON'T advance cursors
 *   pnpm track --reset             # delete cursors first (re-surface full backlog)
 *   pnpm track --since 2025-01-01  # bound the SEC query (default: 1 year back)
 *
 * Requires FMP_API_KEY (estimates/revisions) and optionally SEC_USER_AGENT.
 * SEC works without a key; FMP sources are skipped per-ticker if FMP errors.
 */

import 'dotenv/config';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ThesesFile,
  Event as EventSchema,
  type Event,
  type Thesis,
} from '@stock-vetter/schema';
import {
  fetchTickerEvents,
  toManualEvent,
  loadCursor,
  saveCursor,
  diffEvents,
  emptyCursor,
} from '@stock-vetter/signals';

const CACHE_SIGNALS_DIR = join(process.env.STOCK_VETTER_CACHE_DIR ?? '.cache', 'signals');

type Flags = {
  dryRun: boolean;
  reset: boolean;
  since: string;
  thesisIds: string[];
};

function parseArgs(argv: string[]): Flags {
  // Default SEC lookback: ~1 year. EDGAR's `recent` block covers more, but this
  // keeps a first run from dumping years of 8-Ks.
  const oneYearAgo = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  })();

  const flags: Flags = { dryRun: false, reset: false, since: oneYearAgo, thesisIds: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--dry-run') flags.dryRun = true;
    else if (a === '--reset') flags.reset = true;
    else if (a === '--since') {
      const v = argv[++i];
      if (!v) throw new Error('--since requires a YYYY-MM-DD date');
      flags.since = v;
    } else if (a.startsWith('--')) {
      throw new Error(`unknown flag: ${a}`);
    } else {
      flags.thesisIds.push(a);
    }
  }
  return flags;
}

async function loadTheses(): Promise<Thesis[]> {
  const body = await readFile('data/theses.json', 'utf-8');
  const parsed = ThesesFile.parse(JSON.parse(body));
  return parsed.theses;
}

// Optional hand-entered events (manual watch-items). File is an array of
// toManualEvent() inputs. Absent file ⇒ no manual events (not an error).
async function loadManualEvents(): Promise<Event[]> {
  try {
    const body = await readFile('data/manual-events.json', 'utf-8');
    const raw = JSON.parse(body) as Array<Parameters<typeof toManualEvent>[0]>;
    return raw.map(toManualEvent);
  } catch {
    return [];
  }
}

// Does this manual event belong to this thesis? Match by ticker OR by an
// explicit thesisId tag in the manual entry's payload.
function manualEventMatchesThesis(ev: Event, thesis: Thesis): boolean {
  const tickerMatch = thesis.tickers.includes(ev.ticker) || ev.ticker === thesis.id.toUpperCase();
  const taggedThesis = typeof ev.payload.thesisId === 'string' ? ev.payload.thesisId : null;
  return taggedThesis === thesis.id || tickerMatch;
}

// Which Event sources does any watch-item in this thesis care about?
function thesisUsesAutoFeeds(thesis: Thesis): boolean {
  return thesis.watchItems.some((w) => w.feed === 'auto');
}

async function gatherThesisEvents(
  thesis: Thesis,
  manualEvents: Event[],
  since: string,
): Promise<Event[]> {
  const events: Event[] = [];

  if (thesisUsesAutoFeeds(thesis)) {
    // De-dupe tickers (a ticker can appear in multiple theses; here just within).
    const tickers = [...new Set(thesis.tickers.map((t) => t.toUpperCase()))];
    const perTicker = await Promise.all(
      tickers.map((t) => fetchTickerEvents(t, { sinceDate: since })),
    );
    events.push(...perTicker.flat());
  }

  // Manual events relevant to this thesis.
  events.push(...manualEvents.filter((ev) => manualEventMatchesThesis(ev, thesis)));

  // Validate every event against the schema at the boundary (catches adapter
  // drift early — these flow into diff/cursor).
  return events.map((e) => EventSchema.parse(e));
}

function printEvents(thesisId: string, newEvents: Event[]): void {
  if (!newEvents.length) {
    console.log(`  (no new events)`);
    return;
  }
  for (const ev of newEvents) {
    console.log(`  • [${ev.date}] (${ev.source}) ${ev.ticker} — ${ev.title}`);
    if (ev.url) console.log(`      ${ev.url}`);
    console.log(`      data quality: ${ev.dataQuality}`);
  }
}

async function main(): Promise<void> {
  const flags = parseArgs(process.argv.slice(2));
  const allTheses = await loadTheses();
  const theses = flags.thesisIds.length
    ? allTheses.filter((t) => flags.thesisIds.includes(t.id))
    : allTheses;

  if (!theses.length) {
    const known = allTheses.map((t) => t.id).join(', ');
    throw new Error(
      flags.thesisIds.length
        ? `no thesis matched ${flags.thesisIds.join(', ')}. Known: ${known}`
        : 'data/theses.json has no theses.',
    );
  }

  const manualEvents = await loadManualEvents();

  console.log(
    `Signal Tracker — Phase 1 ingest+diff` +
      `${flags.dryRun ? ' (dry-run: cursors NOT advanced)' : ''}` +
      `${flags.reset ? ' (reset: cursors cleared first)' : ''}\n` +
      `SEC lookback since ${flags.since}; ${theses.length} thesis/es; ` +
      `${manualEvents.length} manual event(s) loaded.\n`,
  );

  let totalNew = 0;
  for (const thesis of theses) {
    console.log(`\n=== ${thesis.id} ===`);
    console.log(`    ${thesis.claim}`);
    console.log(`    tickers: ${thesis.tickers.join(', ')}`);

    if (flags.reset) {
      await rm(join(CACHE_SIGNALS_DIR, `cursor-${thesis.id.replace(/[^a-zA-Z0-9._-]/g, '_')}.json`), {
        force: true,
      });
    }

    const cursor = flags.reset ? emptyCursor(thesis.id) : await loadCursor(thesis.id);
    const fetched = await gatherThesisEvents(thesis, manualEvents, flags.since);
    const { newEvents, nextCursor } = diffEvents(cursor, fetched);

    console.log(
      `  ${fetched.length} candidate event(s); ${cursor.seenKeys.length} previously seen; ` +
        `${newEvents.length} NEW:`,
    );
    printEvents(thesis.id, newEvents);

    totalNew += newEvents.length;
    if (!flags.dryRun) await saveCursor(nextCursor);
  }

  console.log(`\n---\nTotal new events across ${theses.length} thesis/es: ${totalNew}.`);
  if (flags.dryRun) console.log('(dry-run — cursors unchanged; re-run without --dry-run to advance.)');
}

main().catch((err) => {
  console.error(`\ntrack failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
