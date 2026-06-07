#!/usr/bin/env tsx
/**
 * scripts/av-spike.ts — Alpha Vantage transcript SPIKE (measurement only).
 *
 * Fetches NVDA 2025Q4 from Alpha Vantage, routes the (proper-noun-mangled) text
 * through the existing normalize pass, builds an Event, and runs it through the
 * existing extract→critique→judge engine against the NVDA-margin-durability
 * watch-items — TWICE: once on the full transcript, once on Q&A-only — and
 * reports token cost + whether the signal engages the margin/ASIC content.
 *
 * Wires NOTHING into a feed. Prints numbers, then stops.
 *
 * Usage:  pnpm tsx scripts/av-spike.ts
 * Needs ALPHAVANTAGE_API_KEY and ANTHROPIC_API_KEY.
 */

import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { ThesesFile, type Event, type Thesis, type WatchItem } from '@stock-vetter/schema';
import {
  fetchEarningsTranscript,
  transcriptToText,
  loadPrompt,
  llmCall,
  newCostTracker,
  summarizeCost,
  type EarningsTranscript,
} from '@stock-vetter/core';
import { evaluatePair } from '@stock-vetter/signals';

const SYMBOL = 'NVDA';
const QUARTER = '2025Q4';

// Run the existing normalize prompt over raw transcript text to fix the
// auto-transcription proper-noun mangling (DeepSeq→DeepSeek, GV200→GB200, …).
// The prompt is YouTube-framed but the task (fix garbled proper nouns, don't
// rewrite) transfers directly; we feed AV's symbol/quarter as the context.
async function normalizeText(
  raw: string,
  symbol: string,
  quarter: string,
  tracker: ReturnType<typeof newCostTracker>,
): Promise<string> {
  const system = await loadPrompt('normalize');
  const userMessage = [
    `TITLE: ${symbol} ${quarter} earnings call transcript`,
    `CHANNEL: Alpha Vantage (auto-transcribed)`,
    `DESCRIPTION: NVIDIA Corporation (${symbol}) earnings call. Known terms: Blackwell, Hopper, GB200, Grace, NVLink, FP4, Nemotron, DeepSeek, CUDA.`,
    `TAGS: ${symbol}, earnings, semiconductors`,
    '',
    'TRANSCRIPT:',
    raw,
  ].join('\n');
  const res = await llmCall({
    stage: 'av-normalize',
    systemPrompt: system,
    userMessage,
    maxTokens: 16384,
    tracker,
  });
  return res.text;
}

function buildTranscriptEvent(t: EarningsTranscript, normalizedText: string, segment: string): Event {
  return {
    dedupKey: `av:${t.symbol}:${t.quarter}:${segment}`,
    source: 'manual', // SPIKE: not a real feed source yet
    ticker: t.symbol,
    date: '2025-02-26', // NVDA FY25 Q4 call date (calendar Q4 2025 per AV labeling)
    title: `${t.symbol} ${t.quarter} earnings-call transcript (${segment})`,
    url: null,
    payload: { transcriptText: normalizedText },
    // (b) AV sentiment is non-discriminating (role, not content) — carried as
    // metadata only, never a scoring input. Stamp it on dataQuality.
    dataQuality:
      `source=Alpha Vantage EARNINGS_CALL_TRANSCRIPT (${segment}); ` +
      `text normalized for auto-transcription mangling; ` +
      `AV sentiment: low-confidence, unused in scoring`,
  };
}

// evaluatePair calls loadEventContent internally, which for a manual event
// JSON-stringifies the payload. To feed clean text (accurate token count) we
// inject the transcript as the event content by overriding the payload to a
// single string field the extractor reads as the fact. We measure ACTUAL API
// input tokens via the tracker regardless, so the number is the real cost.
async function runPass(opts: {
  label: string;
  thesis: Thesis;
  watchItem: WatchItem;
  event: Event;
}): Promise<{ tokens: { input: number; output: number }; cost: number; outcome: unknown }> {
  const tracker = newCostTracker();
  const outcome = await evaluatePair({
    thesis: opts.thesis,
    watchItem: opts.watchItem,
    event: opts.event,
    allEvents: [opts.event],
    reverseDcfByTicker: new Map(),
    tracker,
  });
  const s = summarizeCost(tracker);
  const input = tracker.byCall.reduce((n, c) => n + c.inputTokens + c.cacheReadTokens + c.cacheWriteTokens, 0);
  const output = tracker.byCall.reduce((n, c) => n + c.outputTokens, 0);
  return { tokens: { input, output }, cost: s.total, outcome };
}

function describeOutcome(o: unknown): string {
  const r = o as { kind: string; reason?: string; signal?: { direction: string; magnitude: number; confidence: string; rationale: string; citation: string } };
  if (r.kind === 'no-candidate') return `no-candidate: ${r.reason}`;
  const s = r.signal!;
  return `SIGNAL ${s.direction} mag=${s.magnitude.toFixed(2)} (${s.confidence})\n    rationale: ${s.rationale}\n    citation: ${s.citation}`;
}

async function main(): Promise<void> {
  console.log(`Alpha Vantage transcript spike — ${SYMBOL} ${QUARTER}\n`);

  const thesis = ThesesFile.parse(JSON.parse(await readFile('data/theses.json', 'utf-8'))).theses.find(
    (t) => t.id === 'NVDA-margin-durability',
  );
  if (!thesis) throw new Error('NVDA-margin-durability thesis not found');
  const watchItem = thesis.watchItems.find((w) => w.id === 'nvda-gross-margin-guide');
  if (!watchItem) throw new Error('nvda-gross-margin-guide watch-item not found');

  // 1. Fetch + segment.
  const transcript = await fetchEarningsTranscript(SYMBOL, QUARTER);
  const fullChars = transcriptToText(transcript, { segment: 'all' }).length;
  const qaChars = transcriptToText(transcript, { segment: 'qa' }).length;
  console.log(`Fetched ${transcript.turns.length} turns. Full ${fullChars} chars; Q&A-only ${qaChars} chars (${((qaChars / fullChars) * 100).toFixed(0)}%).`);

  // 2. Normalize each variant (the proper-noun pass). Measured separately so
  //    the normalize cost is visible.
  const normTracker = newCostTracker();
  const fullNorm = await normalizeText(transcriptToText(transcript, { segment: 'all' }), SYMBOL, QUARTER, normTracker);
  const qaNorm = await normalizeText(transcriptToText(transcript, { segment: 'qa' }), SYMBOL, QUARTER, normTracker);
  const normCost = summarizeCost(normTracker).total;
  console.log(`Normalize pass: $${normCost.toFixed(4)} (both variants).\n`);

  // 3. Run the engine on each variant.
  const fullEvent = buildTranscriptEvent(transcript, fullNorm, 'full');
  const qaEvent = buildTranscriptEvent(transcript, qaNorm, 'qa-only');

  console.log('=== FULL-TRANSCRIPT PASS ===');
  const full = await runPass({ label: 'full', thesis, watchItem, event: fullEvent });
  console.log(`  tokens: ${full.tokens.input} in / ${full.tokens.output} out | engine cost $${full.cost.toFixed(4)}`);
  console.log(`  ${describeOutcome(full.outcome)}\n`);

  console.log('=== Q&A-ONLY PASS ===');
  const qa = await runPass({ label: 'qa', thesis, watchItem, event: qaEvent });
  console.log(`  tokens: ${qa.tokens.input} in / ${qa.tokens.output} out | engine cost $${qa.cost.toFixed(4)}`);
  console.log(`  ${describeOutcome(qa.outcome)}\n`);

  // 4. Report.
  console.log('=== SPIKE SUMMARY ===');
  console.log(`  Full pass total (normalize-full + engine): $${(full.cost).toFixed(4)} engine + share of $${normCost.toFixed(4)} normalize`);
  console.log(`  Full engine pass:   ${full.tokens.input} in / ${full.tokens.output} out  → $${full.cost.toFixed(4)}`);
  console.log(`  Q&A-only engine:    ${qa.tokens.input} in / ${qa.tokens.output} out  → $${qa.cost.toFixed(4)}`);
  console.log(`  Q&A saves ${(((full.cost - qa.cost) / full.cost) * 100).toFixed(0)}% of engine cost.`);
}

main().catch((err) => {
  console.error(`\nav-spike failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
