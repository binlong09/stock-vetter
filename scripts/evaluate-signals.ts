#!/usr/bin/env tsx
/**
 * scripts/evaluate-signals.ts — Signal Tracker Phase 2: the signal evaluator.
 *
 * For each thesis in data/theses.json:
 *   1. gather candidate Events for the thesis's tickers (SEC + FMP), bounded by
 *      a narrow --since window (default: last quarter, to keep the hand-check
 *      to ~10-20 classifications rather than the full backlog),
 *   2. map each event to the thesis's watch-items — a ZERO-TOKEN filter; an
 *      event that maps to no watch-item costs nothing,
 *   3. for each mapped (event × watch-item), run extract → critique → judge
 *      (packages/signals/evaluate.ts), and
 *   4. write one markdown thesis card to fixtures/theses/<thesis-id>.md.
 *
 * NO persistence (cursors untouched), NO scheduler, NO web — those are Phase 3+.
 * This is a snapshot for the hand-check at the Phase 2 checkpoint.
 *
 * Cost guards (reused convention): warn at $0.75, ABORT at $1.50 (per run).
 *
 * Usage:
 *   pnpm evaluate-signals                 # all theses, last quarter
 *   pnpm evaluate-signals NVDA-margin-durability
 *   pnpm evaluate-signals --since 2026-01-01
 *
 * Requires ANTHROPIC_API_KEY and FMP_API_KEY. SEC_USER_AGENT recommended.
 */

import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ThesesFile,
  Event as EventSchema,
  type Event,
  type Signal,
  type Thesis,
  type ReverseDcfReport,
} from '@stock-vetter/schema';
import {
  fetchTickerEvents,
  toManualEvent,
  collapseRevisionsForEval,
  mapEventsToWatchItems,
  buildTickerReverseDcf,
  evaluatePair,
  renderThesisCard,
} from '@stock-vetter/signals';
import { newCostTracker, summarizeCost } from '@stock-vetter/core';

const COST_WARN = 0.75;
const COST_ABORT = 1.5;

class CostAbort extends Error {
  constructor(public readonly total: number) {
    super(`evaluation aborted: cost exceeded $${COST_ABORT.toFixed(2)} (current $${total.toFixed(3)})`);
    this.name = 'CostAbort';
  }
}

type Flags = { since: string; thesisIds: string[] };

function lastQuarterISO(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return d.toISOString().slice(0, 10);
}

function parseArgs(argv: string[]): Flags {
  const flags: Flags = { since: lastQuarterISO(), thesisIds: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--since') {
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
  return ThesesFile.parse(JSON.parse(body)).theses;
}

async function loadManualEvents(): Promise<Event[]> {
  try {
    const body = await readFile('data/manual-events.json', 'utf-8');
    const raw = JSON.parse(body) as Array<Parameters<typeof toManualEvent>[0]>;
    return raw.map(toManualEvent);
  } catch {
    return [];
  }
}

function manualMatches(ev: Event, thesis: Thesis): boolean {
  const taggedThesis = typeof ev.payload.thesisId === 'string' ? ev.payload.thesisId : null;
  return taggedThesis === thesis.id || thesis.tickers.includes(ev.ticker);
}

async function gatherThesisEvents(thesis: Thesis, manual: Event[], since: string): Promise<Event[]> {
  const events: Event[] = [];
  if (thesis.watchItems.some((w) => w.feed === 'auto')) {
    const tickers = [...new Set(thesis.tickers.map((t) => t.toUpperCase()))];
    const perTicker = await Promise.all(tickers.map((t) => fetchTickerEvents(t, { sinceDate: since })));
    events.push(...perTicker.flat());
  }
  events.push(...manual.filter((ev) => manualMatches(ev, thesis)));
  // Validate, then collapse redundant monthly revision snapshots. Note: the
  // FULL event set (incl. all months) is still passed to evaluatePair as
  // `allEvents` so the trend summary sees every month — we only collapse what
  // becomes an evaluated PAIR.
  return events.map((e) => EventSchema.parse(e));
}

async function main(): Promise<void> {
  const flags = parseArgs(process.argv.slice(2));
  const all = await loadTheses();
  const theses = flags.thesisIds.length ? all.filter((t) => flags.thesisIds.includes(t.id)) : all;
  if (!theses.length) {
    throw new Error(`no thesis matched. Known: ${all.map((t) => t.id).join(', ')}`);
  }

  const manual = await loadManualEvents();
  const generatedAt = new Date().toISOString();

  // One shared cost tracker across the whole run, with the warn/abort guards.
  let warned = false;
  const tracker = newCostTracker((total) => {
    if (!warned && total > COST_WARN) {
      warned = true;
      process.stderr.write(`[evaluate] WARNING: cost exceeded $${COST_WARN.toFixed(2)} (current $${total.toFixed(3)})\n`);
    }
    if (total > COST_ABORT) throw new CostAbort(total);
  });

  console.log(
    `Signal evaluator — Phase 2 (since ${flags.since}; ${theses.length} thesis/es). ` +
      `Cost guard: warn $${COST_WARN}, abort $${COST_ABORT}.\n`,
  );

  await mkdir('fixtures/theses', { recursive: true });

  // Reverse-DCF is per-ticker and constant across events — build once, memoized.
  const dcfByTicker = new Map<string, ReverseDcfReport | null>();
  async function dcfFor(ticker: string): Promise<ReverseDcfReport | null> {
    const key = ticker.toUpperCase();
    if (dcfByTicker.has(key)) return dcfByTicker.get(key)!;
    const dcf = await buildTickerReverseDcf(key);
    dcfByTicker.set(key, dcf);
    return dcf;
  }

  for (const thesis of theses) {
    console.log(`\n=== ${thesis.id} ===`);
    const events = await gatherThesisEvents(thesis, manual, flags.since);
    // Evaluate against the collapsed set (one revision event per ticker), but
    // keep `events` (all months) for the bull-index trend summary.
    const evalEvents = collapseRevisionsForEval(events);
    const pairs = mapEventsToWatchItems(thesis, evalEvents);
    console.log(
      `  ${events.length} event(s) in window (${evalEvents.length} after collapsing monthly revisions); ` +
        `${pairs.length} (event × watch-item) pair(s) to evaluate ` +
        `(${evalEvents.length - new Set(pairs.map((p) => p.event.dedupKey)).size} event(s) mapped to no watch-item — 0 tokens).`,
    );

    // Pre-warm reverse-DCF for the tickers we'll evaluate.
    for (const t of new Set(pairs.map((p) => p.event.ticker))) await dcfFor(t);

    const signals: Signal[] = [];
    let noCandidate = 0;
    for (const { event, watchItem } of pairs) {
      const outcome = await evaluatePair({
        thesis,
        watchItem,
        event,
        allEvents: events,
        reverseDcfByTicker: dcfByTicker,
        tracker,
      });
      if (outcome.kind === 'signal') {
        signals.push(outcome.signal);
        const s = outcome.signal;
        console.log(`  • SIGNAL ${watchItem.id} [${event.dedupKey}]: ${s.direction} mag=${s.magnitude.toFixed(2)} (${s.confidence})`);
      } else {
        noCandidate++;
        console.log(`  · no-candidate ${watchItem.id} [${event.dedupKey}]: ${outcome.reason}`);
      }
    }

    const card = renderThesisCard({
      thesis,
      signals,
      noCandidateCount: noCandidate,
      evaluatedPairs: pairs.length,
      generatedAt,
    });
    const path = join('fixtures/theses', `${thesis.id}.md`);
    await writeFile(path, card, 'utf-8');
    console.log(`  → wrote ${path} (${signals.length} signal(s), provisional status in card)`);
  }

  const summary = summarizeCost(tracker);
  console.log(`\n---\nTotal LLM cost this run: $${summary.total.toFixed(3)} across ${tracker.byCall.length} call(s).`);
}

main().catch((err) => {
  if (err instanceof CostAbort) {
    console.error(`\n${err.message}`);
  } else {
    console.error(`\nevaluate-signals failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  process.exitCode = 1;
});
