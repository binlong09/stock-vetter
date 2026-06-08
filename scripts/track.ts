#!/usr/bin/env tsx
/**
 * scripts/track.ts — Signal Tracker orchestrator.
 *
 * Production path: ingest → diff against the Turso cursor → evaluate ONLY the
 * new events → update tripwire state → persist (cursor + thesis status) to
 * Turso. Cursor-gated, so steady-state runs are cheap (only genuinely new
 * filings/estimates are evaluated). Authoritative state lives in Turso so the
 * scheduled cron (ephemeral runner, no .cache) doesn't re-process the backlog.
 *
 * Without Turso configured, it falls back to the local .cache/signals/ cursor
 * store and skips status persistence — a local-dev convenience.
 *
 * Modes:
 *   --no-eval    ingest + diff only, print new events, NO LLM (Phase-1 behavior)
 *   (default)    ingest + diff + evaluate new events + update + persist state
 *
 * Flags:
 *   pnpm track                          # all theses, evaluate new events
 *   pnpm track NVDA-margin-durability   # one thesis
 *   pnpm track --no-eval                # diff only (no LLM)
 *   pnpm track --dry-run                # don't persist cursors/status
 *   pnpm track --reset                  # clear this thesis's cursor first (backlog)
 *   pnpm track --since 2026-04-01       # bound the SEC query
 *   pnpm track --holder cron            # run-lock holder label (default: manual:<host>)
 *
 * Cost guard (reused): warn $0.75, ABORT $1.50 per run.
 * Requires FMP_API_KEY (+ ANTHROPIC_API_KEY unless --no-eval). TURSO_* for
 * persistence; SEC_USER_AGENT recommended.
 */

import 'dotenv/config';
import { hostname } from 'node:os';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ThesesFile,
  Event as EventSchema,
  type Event,
  type ReverseDcfReport,
  type Signal,
  type Thesis,
} from '@stock-vetter/schema';
import {
  fetchTickerEvents,
  toManualEvent,
  loadCursor,
  saveCursor,
  emptyCursor,
  diffEvents,
  collapseRevisionsForEval,
  mapEventsToWatchItems,
  buildTickerReverseDcf,
  evaluatePair,
  renderThesisCard,
  computeThesisStatus,
  isTursoConfigured,
  loadCursorFromTurso,
  saveCursorToTurso,
  loadThesisStatus,
  saveThesisStatus,
  saveSignals,
  saveThesisDefinition,
  acquireRunLock,
  releaseRunLock,
  detectFlips,
  renderDigest,
  type WatchItemFlip,
} from '@stock-vetter/signals';
import { newCostTracker, summarizeCost, isMailerConfigured, sendEmail } from '@stock-vetter/core';

const CACHE_SIGNALS_DIR = join(process.env.STOCK_VETTER_CACHE_DIR ?? '.cache', 'signals');
const COST_WARN = 0.75;
const COST_ABORT = 1.5;

class CostAbort extends Error {
  constructor(public readonly total: number) {
    super(`track aborted: cost exceeded $${COST_ABORT.toFixed(2)} (current $${total.toFixed(3)})`);
    this.name = 'CostAbort';
  }
}

type Flags = {
  noEval: boolean;
  dryRun: boolean;
  reset: boolean;
  since: string;
  holder: string;
  allowBacklog: boolean;
  digestTo: string | null;
  thesisIds: string[];
};

// Cold-start guard. A thesis with an empty cursor (newly added, or a new ticker
// added to an existing thesis) would otherwise evaluate its whole backlog on
// the first run — potentially dozens of pairs, tripping the $1.50 abort by
// accident. Above this many pairs on a cold start we refuse and print an
// estimate, unless --allow-backlog is passed (deliberate opt-in).
const COLD_START_PAIR_LIMIT = 8;
// Rough cost per evaluated pair, for the estimate: extract + critique + 3 judge
// samples ≈ $0.04-0.06 in practice. Use the upper end so the estimate is a
// conservative ceiling, not a lowball.
const EST_COST_PER_PAIR = 0.06;

function parseArgs(argv: string[]): Flags {
  const oneYearAgo = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  })();
  const flags: Flags = {
    noEval: false,
    dryRun: false,
    reset: false,
    since: oneYearAgo,
    holder: `manual:${hostname()}`,
    allowBacklog: false,
    digestTo: process.env.SIGNAL_DIGEST_TO ?? null,
    thesisIds: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--no-eval') flags.noEval = true;
    else if (a === '--dry-run') flags.dryRun = true;
    else if (a === '--reset') flags.reset = true;
    else if (a === '--allow-backlog') flags.allowBacklog = true;
    else if (a === '--digest-to') {
      const v = argv[++i];
      if (!v) throw new Error('--digest-to requires an email address');
      flags.digestTo = v;
    } else if (a === '--since') {
      const v = argv[++i];
      if (!v) throw new Error('--since requires a YYYY-MM-DD date');
      flags.since = v;
    } else if (a === '--holder') {
      const v = argv[++i];
      if (!v) throw new Error('--holder requires a value');
      flags.holder = v;
    } else if (a.startsWith('--')) {
      throw new Error(`unknown flag: ${a}`);
    } else {
      flags.thesisIds.push(a);
    }
  }
  return flags;
}

async function loadTheses(): Promise<Thesis[]> {
  return ThesesFile.parse(JSON.parse(await readFile('data/theses.json', 'utf-8'))).theses;
}

async function loadManualEvents(): Promise<Event[]> {
  try {
    const raw = JSON.parse(await readFile('data/manual-events.json', 'utf-8')) as Array<
      Parameters<typeof toManualEvent>[0]
    >;
    return raw.map(toManualEvent);
  } catch {
    return [];
  }
}

function manualMatches(ev: Event, thesis: Thesis): boolean {
  const taggedThesis = typeof ev.payload.thesisId === 'string' ? ev.payload.thesisId : null;
  return (
    taggedThesis === thesis.id ||
    thesis.tickers.includes(ev.ticker) ||
    ev.ticker === thesis.id.toUpperCase()
  );
}

async function gatherThesisEvents(
  thesis: Thesis,
  manual: Event[],
  since: string,
  asOfDate: string,
): Promise<Event[]> {
  const events: Event[] = [];
  if (thesis.watchItems.some((w) => w.feed === 'auto')) {
    const tickers = [...new Set(thesis.tickers.map((t) => t.toUpperCase()))];
    // asOfDate enables the av-transcript event (most-recent completed quarter).
    const perTicker = await Promise.all(
      tickers.map((t) => fetchTickerEvents(t, { sinceDate: since, asOfDate })),
    );
    events.push(...perTicker.flat());
  }
  events.push(...manual.filter((ev) => manualMatches(ev, thesis)));
  return events.map((e) => EventSchema.parse(e));
}

// Cursor abstraction over Turso (authoritative) with .cache fallback.
const usingTurso = isTursoConfigured();

async function readCursor(thesisId: string, reset: boolean) {
  if (reset) return emptyCursor(thesisId);
  return usingTurso ? loadCursorFromTurso(thesisId) : loadCursor(thesisId);
}

async function writeCursor(thesisId: string, newEvents: Event[], nextCursor: ReturnType<typeof diffEvents>['nextCursor']): Promise<void> {
  if (usingTurso) {
    await saveCursorToTurso(thesisId, newEvents);
  } else {
    await saveCursor(nextCursor);
  }
}

async function main(): Promise<void> {
  const flags = parseArgs(process.argv.slice(2));
  const all = await loadTheses();
  const theses = flags.thesisIds.length
    ? all.filter((t) => flags.thesisIds.includes(t.id))
    : all;
  if (!theses.length) {
    throw new Error(`no thesis matched. Known: ${all.map((t) => t.id).join(', ')}`);
  }

  const manual = await loadManualEvents();
  const now = new Date().toISOString();

  console.log(
    `Signal Tracker — ${flags.noEval ? 'ingest+diff (no LLM)' : 'ingest+diff+evaluate'}` +
      `${flags.dryRun ? ' (dry-run: state NOT persisted)' : ''}` +
      `${flags.reset ? ' (reset: cursor cleared first)' : ''}\n` +
      `state: ${usingTurso ? 'Turso (authoritative)' : '.cache/signals (local fallback — no status persistence)'}; ` +
      `SEC since ${flags.since}; ${theses.length} thesis/es; ${manual.length} manual event(s).` +
      (flags.noEval ? '' : `  Cost guard: warn $${COST_WARN}, abort $${COST_ABORT}.`) +
      '\n',
  );

  // Run-lock: the cron is the authoritative writer; a manual run that finds a
  // live lock backs off (unless dry-run, which never writes).
  let lockHeld = false;
  if (usingTurso && !flags.dryRun) {
    lockHeld = await acquireRunLock(flags.holder);
    if (!lockHeld) {
      throw new Error(
        'another run holds the Turso run-lock (the cron is the authoritative writer). ' +
          'Wait for it to finish, or re-run with --dry-run.',
      );
    }
  }

  let warned = false;
  const tracker = newCostTracker((total) => {
    if (!warned && total > COST_WARN) {
      warned = true;
      process.stderr.write(`[track] WARNING: cost exceeded $${COST_WARN.toFixed(2)} (current $${total.toFixed(3)})\n`);
    }
    if (total > COST_ABORT) throw new CostAbort(total);
  });

  if (!flags.noEval) await mkdir('fixtures/theses', { recursive: true });
  const dcfByTicker = new Map<string, ReverseDcfReport | null>();

  let totalNew = 0;
  let totalSignals = 0;
  // Flips are STATE TRANSITIONS (prior persisted → new), not current state — so
  // a thesis that stays red day over day does NOT re-flip (and won't re-email).
  const flips: WatchItemFlip[] = [];

  try {
    for (const thesis of theses) {
      console.log(`\n=== ${thesis.id} ===`);

      // Mirror the thesis definition (claim, watch-items) into Turso so the web
      // app reads it from there — runs every time, regardless of new events, so
      // a data/theses.json edit propagates on the next run.
      if (usingTurso && !flags.dryRun) await saveThesisDefinition(thesis, now);

      if (flags.reset && !usingTurso) {
        await rm(join(CACHE_SIGNALS_DIR, `cursor-${thesis.id.replace(/[^a-zA-Z0-9._-]/g, '_')}.json`), { force: true });
      }

      const cursor = await readCursor(thesis.id, flags.reset);
      const fetched = await gatherThesisEvents(thesis, manual, flags.since, now.slice(0, 10));
      const { newEvents, nextCursor } = diffEvents(cursor, fetched);
      totalNew += newEvents.length;
      console.log(`  ${fetched.length} candidate event(s); ${cursor.seenKeys.length} seen; ${newEvents.length} NEW.`);

      if (flags.noEval) {
        for (const ev of newEvents) console.log(`  • [${ev.date}] (${ev.source}) ${ev.ticker} — ${ev.title}`);
        if (!flags.dryRun) await writeCursor(thesis.id, newEvents, nextCursor);
        continue;
      }

      if (!newEvents.length) {
        console.log('  (no new events — nothing to evaluate)');
        continue;
      }

      // Evaluate only the NEW events (cursor-gated). Collapse redundant monthly
      // revision snapshots into one pair per ticker; pass the full fetched set
      // for the bull-index trend summary.
      const evalEvents = collapseRevisionsForEval(newEvents);
      const pairs = mapEventsToWatchItems(thesis, evalEvents);

      // Cold-start guard: an empty cursor means this thesis (or a newly added
      // ticker on it) has never run, so `pairs` is the whole backlog, not a
      // steady-state delta. Refuse a large backlog unless explicitly opted in,
      // so adding a 6th ticker never trips the abort by accident. Steady-state
      // cursor-gated runs (cursor already populated) skip this entirely.
      const isColdStart = cursor.seenKeys.length === 0;
      if (isColdStart && pairs.length > COLD_START_PAIR_LIMIT && !flags.allowBacklog) {
        const est = (pairs.length * EST_COST_PER_PAIR).toFixed(2);
        console.log(
          `  ⛔ COLD START: empty cursor, ${pairs.length} pairs (~$${est}) exceeds the ` +
            `${COLD_START_PAIR_LIMIT}-pair backlog limit.\n` +
            `     This is a backlog run, not a steady-state delta. Re-run with a narrower\n` +
            `     --since window to shrink it, or --allow-backlog to evaluate the full\n` +
            `     backlog deliberately. Skipping this thesis; cursor NOT advanced.`,
        );
        continue;
      }
      if (isColdStart) {
        console.log(`  (cold start: empty cursor, ${pairs.length} pairs ~$${(pairs.length * EST_COST_PER_PAIR).toFixed(2)} — within limit)`);
      }
      console.log(`  evaluating ${pairs.length} (event × watch-item) pair(s)…`);
      for (const t of new Set(pairs.map((p) => p.event.ticker))) {
        if (!dcfByTicker.has(t.toUpperCase())) dcfByTicker.set(t.toUpperCase(), await buildTickerReverseDcf(t));
      }

      const signals: Signal[] = [];
      let noCandidate = 0;
      for (const { event, watchItem } of pairs) {
        const outcome = await evaluatePair({
          thesis,
          watchItem,
          event,
          allEvents: fetched,
          reverseDcfByTicker: dcfByTicker,
          tracker,
          now,
        });
        if (outcome.kind === 'signal') {
          signals.push(outcome.signal);
          console.log(`  • SIGNAL ${watchItem.id}: ${outcome.signal.direction} mag=${outcome.signal.magnitude.toFixed(2)}`);
        } else {
          noCandidate++;
        }
      }
      totalSignals += signals.length;

      // Tripwire state: fold this run's signals into the (sticky) thesis status.
      const prior = usingTurso ? await loadThesisStatus(thesis.id) : null;
      const status = computeThesisStatus({ thesis, signals, priorStatus: prior, now });
      console.log(`  status: ${status.health.toUpperCase()}${status.trippedWatchItemIds.length ? ` — TRIPPED: ${status.trippedWatchItemIds.join(', ')}` : ''}`);

      // Digest fires on the prior→new TRANSITION, computed BEFORE we overwrite
      // the persisted prior with saveThesisStatus below. No transition ⇒ no flip.
      const thesisFlips = detectFlips({ thesis, priorStatus: prior, newStatus: status, signals });
      for (const f of thesisFlips) {
        flips.push(f);
        console.log(`  ⚑ FLIP ${f.watchItemId}: ${f.from} → ${f.to}`);
      }

      // Card snapshot.
      const card = renderThesisCard({ thesis, signals, noCandidateCount: noCandidate, evaluatedPairs: pairs.length, generatedAt: now });
      await writeFile(join('fixtures/theses', `${thesis.id}.md`), card, 'utf-8');

      if (!flags.dryRun) {
        await writeCursor(thesis.id, newEvents, nextCursor);
        if (usingTurso) {
          // Persist the individual signals (web-view source) AND the aggregate
          // status. Signals upsert by (thesis, watch-item, event) so a re-run
          // doesn't duplicate.
          await saveSignals(signals, now);
          await saveThesisStatus(status);
        }
      }
    }
  } finally {
    if (lockHeld) await releaseRunLock(flags.holder);
  }

  // Email digest — ONLY when there were real state transitions this run, and
  // only after state was persisted (so the next run sees the new baseline and
  // won't re-email the same flip). Silence is the default.
  if (flips.length && !flags.dryRun) {
    if (isMailerConfigured() && flags.digestTo) {
      const baseUrl = process.env.SIGNAL_TRACKER_BASE_URL ?? 'https://example.com';
      const { subject, html, text } = renderDigest(flips, baseUrl);
      try {
        await sendEmail({ to: flags.digestTo, subject, html, text });
        console.log(`\n📧 Digest sent to ${flags.digestTo} (${flips.length} flip(s)).`);
      } catch (err) {
        process.stderr.write(`[track] digest send failed: ${err instanceof Error ? err.message : err}\n`);
      }
    } else {
      console.log(
        `\n📧 ${flips.length} flip(s) detected but no digest sent ` +
          `(${flags.digestTo ? 'mailer not configured' : 'no --digest-to recipient'}).`,
      );
    }
  }

  const summary = summarizeCost(tracker);
  console.log(
    `\n---\nNew events: ${totalNew}. Signals: ${totalSignals}. ` +
      `Tripwire flips: ${flips.length ? flips.map((f) => `${f.thesisId}/${f.watchItemId}(${f.from}→${f.to})`).join(', ') : 'none'}. ` +
      `LLM cost: $${summary.total.toFixed(3)}.` +
      (flags.dryRun ? '  (dry-run — state unchanged.)' : ''),
  );
}

main().catch((err) => {
  if (err instanceof CostAbort) console.error(`\n${err.message}`);
  else console.error(`\ntrack failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
