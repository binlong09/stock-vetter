#!/usr/bin/env tsx
/**
 * scripts/signals-spike.ts — Signal Tracker Phase 0 spike.
 *
 * Proves what the Financial Modeling Prep adapter in
 * packages/signals/src/feeds.ts can pull, for one ticker, across the three
 * series we are de-risking before committing to the FMP tier:
 *
 *   1. the latest earnings-call transcript,
 *   2. current consensus analyst estimates,
 *   3. estimate-revision history (monthly analyst-ratings distribution).
 *
 * Each block is probed independently and a tier-gating error (FmpTierError) on
 * one block does NOT abort the others — the whole point of Phase 0 is to learn
 * which of the three the current plan actually covers.
 *
 * No theses, no LLM, no DB. Output goes to stdout for hand-inspection.
 *
 * Usage:
 *   pnpm tsx scripts/signals-spike.ts            # defaults to NVDA
 *   pnpm tsx scripts/signals-spike.ts AAPL
 *
 * Requires FMP_API_KEY in .env.
 */

import 'dotenv/config';
import {
  FmpTierError,
  fetchLatestTranscript,
  fetchConsensusEstimates,
  fetchEstimateRevisions,
} from '@stock-vetter/signals';

const TRANSCRIPT_PREVIEW_CHARS = 1500;

type BlockStatus = 'covered' | 'not-in-tier' | 'error';
const coverage: Record<string, BlockStatus> = {};

function fmtMoney(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toFixed(2)}`;
}

function hr(title: string): void {
  console.log(`\n${'='.repeat(72)}`);
  console.log(title);
  console.log('='.repeat(72));
}

// Run one probe block; classify the outcome so the checkpoint can summarize
// tier coverage. A tier error is reported, not thrown.
async function block(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    coverage[name] = 'covered';
  } catch (err) {
    if (err instanceof FmpTierError) {
      coverage[name] = 'not-in-tier';
      console.log(`\n  ⚠ NOT IN CURRENT FMP TIER (${err.endpoint}): ${err.message}`);
    } else {
      coverage[name] = 'error';
      console.log(`\n  ✗ ERROR: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

async function main(): Promise<void> {
  const ticker = (process.argv[2] ?? 'NVDA').toUpperCase();
  console.log(`Signal Tracker — Phase 0 FMP spike for ${ticker}`);

  // --- 1. Latest earnings-call transcript ---
  hr('1. LATEST EARNINGS-CALL TRANSCRIPT');
  await block('transcript', async () => {
    const transcript = await fetchLatestTranscript(ticker);
    console.log(
      `${transcript.symbol} ${transcript.quarter} ${transcript.year} — call date ${transcript.date}`,
    );
    console.log(`Transcript length: ${transcript.content.length.toLocaleString()} chars`);
    console.log(`\nFirst ${TRANSCRIPT_PREVIEW_CHARS} chars:\n`);
    console.log(transcript.content.slice(0, TRANSCRIPT_PREVIEW_CHARS));
    if (transcript.content.length > TRANSCRIPT_PREVIEW_CHARS) console.log('\n…[truncated]');
  });

  // --- 2. Current consensus estimates ---
  hr('2. CONSENSUS ANALYST ESTIMATES (annual, oldest → newest)');
  await block('estimates', async () => {
    const estimates = await fetchConsensusEstimates(ticker);
    if (!estimates.length) {
      console.log('No estimates returned.');
      return;
    }
    console.log('Period      | Rev (avg)  | Rev range            | EPS (avg) | #analysts');
    console.log('-'.repeat(78));
    for (const e of estimates) {
      const period = e.date.slice(0, 10).padEnd(11);
      const revAvg = fmtMoney(e.revenueAvg).padEnd(10);
      const revRange = `${fmtMoney(e.revenueLow)}–${fmtMoney(e.revenueHigh)}`.padEnd(20);
      const eps = (e.epsAvg !== null ? e.epsAvg.toFixed(2) : '—').padEnd(9);
      const n = e.numAnalystsEps ?? e.numAnalystsRevenue ?? '—';
      console.log(`${period} | ${revAvg} | ${revRange} | ${eps} | ${n}`);
    }
  });

  // --- 3. Estimate-revision history (monthly ratings distribution) ---
  hr('3. ESTIMATE-REVISION HISTORY (monthly analyst-ratings distribution, newest first)');
  await block('revisions', async () => {
    const revisions = await fetchEstimateRevisions(ticker);
    if (!revisions.length) {
      console.log('No revision snapshots returned.');
      return;
    }
    console.log('Month      | SB  | B   | H   | S   | SS  | Total | BullIndex | Δ vs prior mo');
    console.log('-'.repeat(78));
    // revisions is newest-first; compute month-over-month bull-index drift.
    for (let i = 0; i < revisions.length; i++) {
      const r = revisions[i]!;
      const prior = revisions[i + 1];
      const delta = prior ? r.bullIndex - prior.bullIndex : null;
      const deltaStr = delta === null ? '—' : delta > 0 ? `+${delta}` : `${delta}`;
      console.log(
        `${r.date.slice(0, 10)} | ${String(r.strongBuy).padEnd(3)} | ${String(r.buy).padEnd(3)} | ` +
          `${String(r.hold).padEnd(3)} | ${String(r.sell).padEnd(3)} | ${String(r.strongSell).padEnd(3)} | ` +
          `${String(r.total).padEnd(5)} | ${String(r.bullIndex).padEnd(9)} | ${deltaStr}`,
      );
    }
    console.log('\n(SB=strong buy, B=buy, H=hold, S=sell, SS=strong sell.');
    console.log(' BullIndex = SB*2 + B − (S + SS*2). The month-over-month Δ is the revision-trend signal.)');
  });

  // --- Checkpoint summary ---
  hr('PHASE 0 CHECKPOINT — FMP TIER COVERAGE');
  const label: Record<BlockStatus, string> = {
    covered: '✅ covered',
    'not-in-tier': '⛔ NOT in current tier',
    error: '✗ errored',
  };
  console.log(`  1. earnings-call transcript : ${label[coverage.transcript ?? 'error']}`);
  console.log(`  2. consensus estimates      : ${label[coverage.estimates ?? 'error']}`);
  console.log(`  3. estimate revisions       : ${label[coverage.revisions ?? 'error']}`);
  console.log('');
  const allCovered = Object.values(coverage).every((s) => s === 'covered');
  if (allCovered) {
    console.log('  All three series are covered. Phase 0 gate PASSED — safe to proceed to Phase 1.');
  } else {
    console.log(
      '  At least one series is NOT in the current FMP tier (see ⛔ above). The Phase 0\n' +
        '  gate is to decide whether to upgrade the plan or rescope before continuing.',
    );
  }
}

main().catch((err) => {
  console.error(`\nspike failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
