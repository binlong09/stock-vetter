// 10-Q vs 10-K change detection — ADDITIVE, NON-SCORING.
//
// This pass detects material QUALITATIVE change in the latest 10-Q (MD&A + risk
// factors) against the corresponding 10-K baseline sections. It is the one thing
// value frameworks use a thin, unaudited quarterly for: "what changed since the
// annual baseline?"
//
// It must NOT touch the six durable-quality dimension scores, the meta-card
// verdict/weightedScore, or the reverse DCF. The 10-K + DEF 14A remain the
// scoring anchor. The output is attached to the card after synthesis as an
// independent section — nothing here feeds processPrimaryChecklist or
// processMetaCard.
//
// Source separation is load-bearing: every change carries two citations, one to
// the 10-Q passage and one to the 10-K passage it diverges from, each attributed
// to its own filing and verified against that filing's text. The two are never
// merged. That is why this avoids the citation-consistency hazard that blocked
// folding the 10-Q into scoring.

import type { TenqDelta, TenqChange } from '@stock-vetter/schema';
import { llmCallJson, loadPrompt, type CostTracker, type FilingMeta } from '@stock-vetter/core';
import { z } from 'zod';
import { classifyMatch, type MatchTier } from './citation-verifier.js';

// The LLM returns everything except the provenance fields, which we stamp from
// the FilingMeta we already hold (never trust the model for accessions/dates).
const TenqDeltaLlmOutput = z.object({
  summary: z.string(),
  changes: z.array(
    z.object({
      change: z.string(),
      area: z.string(),
      direction: z.enum(['improving', 'deteriorating', 'neutral-but-notable']),
      tenqCitation: z.object({
        form: z.literal('10-Q'),
        section: z.string(),
        quote: z.string(),
      }),
      tenkCitation: z.object({
        form: z.literal('10-K'),
        section: z.string(),
        quote: z.string(),
      }),
    }),
  ),
});

// The two sections we compare. Risk factors and MD&A are where qualitative
// change surfaces; financial-statements deltas are already covered by the
// (current) companyfacts-driven reverse DCF, so we deliberately exclude them.
const COMPARED_SECTIONS = ['mda', 'risk-factors'] as const;

export type TenqDeltaSourceText = {
  // Section id → text, for one filing. Missing/empty sections are simply absent.
  mda: string | null;
  riskFactors: string | null;
};

export type TenqDeltaVerification = {
  total: number;
  resolved: number; // both citations resolved (exact..punctuation, or leading-window)
  tenqNoMatch: number;
  tenkNoMatch: number;
  // Citations that resolved only via the leading-window fallback — i.e. the
  // model over-quoted (stitched real sentences). Real text, but flagged.
  truncatedQuotes: number;
  details: Array<{
    changeIndex: number;
    area: string;
    tenqTier: QuoteResolution;
    tenkTier: QuoteResolution;
  }>;
};

export type TenqDeltaResult = {
  delta: TenqDelta;
  verification: TenqDeltaVerification;
};

function sectionTextFor(src: TenqDeltaSourceText, section: string): string | null {
  if (section === 'mda') return src.mda;
  if (section === 'risk-factors') return src.riskFactors;
  return null;
}

// How a single citation quote resolved against its source section.
//  - 'exact'..'punctuation-normalized': the full quote is a continuous run in
//    the source (the well-behaved case).
//  - 'leading-window': the full quote did NOT match, but its first ~25 words DO
//    match verbatim. This is the model over-quoting — stitching several real
//    sentences into one string, violating the "one continuous run" rule. The
//    prose is genuinely in the source, so we resolve it but flag the truncation.
//  - 'no-match': not even the leading window is present — likely fabricated or
//    paraphrased. NOT resolved.
type QuoteResolution = MatchTier | 'leading-window';

const LEADING_WINDOW_WORDS = 25;

function leadingWindow(quote: string): string {
  return quote.split(/\s+/).slice(0, LEADING_WINDOW_WORDS).join(' ');
}

// Resolve a quote against section text, with the leading-window fallback for
// over-long stitched quotes.
function resolveQuote(sectionText: string | null, quote: string): QuoteResolution {
  if (!sectionText) return 'no-match';
  const full = classifyMatch(sectionText, quote);
  if (full !== 'no-match') return full;
  // Fallback: does the opening run match? Only meaningful when the quote is long
  // enough to have actually been stitched (a short quote that fails is just a
  // miss). A fabricated quote won't have its first 25 words present verbatim.
  const words = quote.split(/\s+/).length;
  if (words > LEADING_WINDOW_WORDS) {
    const window = leadingWindow(quote);
    if (classifyMatch(sectionText, window) !== 'no-match') return 'leading-window';
  }
  return 'no-match';
}

function isResolved(tier: QuoteResolution): boolean {
  return tier !== 'no-match';
}

function buildFilingBlock(label: string, src: TenqDeltaSourceText): string {
  const parts: string[] = [`### ${label}`];
  for (const section of COMPARED_SECTIONS) {
    const text = sectionTextFor(src, section);
    parts.push(`\n#### section id: ${section}`);
    parts.push(text && text.trim().length > 0 ? text : '(not available in this filing)');
  }
  return parts.join('\n');
}

/**
 * Run the 10-Q-vs-10-K change-detection pass.
 *
 * @param tenkMeta  FilingMeta for the 10-K baseline (provenance + accession).
 * @param tenqMeta  FilingMeta for the latest 10-Q (provenance + accession).
 * @param tenkText  10-K MD&A + risk-factor text.
 * @param tenqText  10-Q MD&A + risk-factor text.
 * @param tracker   shared CostTracker (cost guards live in the caller/orchestrator).
 *
 * The 10-K baseline is marked cacheable: it's the fixed input across re-runs and
 * dominates the token count, so caching it makes re-runs near-free.
 */
export async function runTenqDelta(args: {
  tenkMeta: FilingMeta;
  tenqMeta: FilingMeta;
  tenkText: TenqDeltaSourceText;
  tenqText: TenqDeltaSourceText;
  tracker: CostTracker;
  model?: string;
}): Promise<TenqDeltaResult> {
  const { tenkMeta, tenqMeta, tenkText, tenqText, tracker, model } = args;

  const prompt = await loadPrompt('tenq-delta');

  // 10-K baseline first and cached (fixed, dominant input); the 10-Q (the thing
  // that changes run-to-run) is the uncached tail.
  const baselineBlock = buildFilingBlock(
    `10-K BASELINE — accession ${tenkMeta.accession}, filed ${tenkMeta.filingDate}`,
    tenkText,
  );
  const quarterBlock = buildFilingBlock(
    `10-Q (LATEST QUARTER) — accession ${tenqMeta.accession}, filed ${tenqMeta.filingDate}`,
    tenqText,
  );

  const out = await llmCallJson({
    stage: 'tenq-delta',
    systemPrompt: [{ text: prompt, cache: true }],
    userMessage: [
      {
        text:
          `Compare the latest 10-Q against the 10-K baseline below and report material qualitative changes.\n\n` +
          baselineBlock,
        cache: true,
      },
      { text: `\n\n${quarterBlock}` },
    ],
    schema: TenqDeltaLlmOutput,
    maxTokens: 4096,
    tracker,
    model,
  });

  // Stamp provenance from the FilingMeta we hold — never from the model.
  const changes: TenqChange[] = out.changes.map((c) => ({
    change: c.change,
    area: c.area,
    direction: c.direction,
    tenqCitation: c.tenqCitation,
    tenkCitation: c.tenkCitation,
  }));

  const delta: TenqDelta = {
    tenqAccession: tenqMeta.accession,
    tenqFilingDate: tenqMeta.filingDate,
    tenkAccession: tenkMeta.accession,
    tenkFilingDate: tenkMeta.filingDate,
    summary: out.summary,
    changes,
  };

  // Verify each dual citation against its OWN filing's text — never merged.
  const details: TenqDeltaVerification['details'] = [];
  let tenqNoMatch = 0;
  let tenkNoMatch = 0;
  let resolved = 0;
  let truncatedQuotes = 0;
  for (let i = 0; i < changes.length; i++) {
    const c = changes[i]!;
    const tenqSrc = sectionTextFor(tenqText, c.tenqCitation.section);
    const tenkSrc = sectionTextFor(tenkText, c.tenkCitation.section);
    const tenqTier = resolveQuote(tenqSrc, c.tenqCitation.quote);
    const tenkTier = resolveQuote(tenkSrc, c.tenkCitation.quote);
    if (!isResolved(tenqTier)) tenqNoMatch++;
    if (!isResolved(tenkTier)) tenkNoMatch++;
    if (tenqTier === 'leading-window') truncatedQuotes++;
    if (tenkTier === 'leading-window') truncatedQuotes++;
    if (isResolved(tenqTier) && isResolved(tenkTier)) resolved++;
    details.push({ changeIndex: i, area: c.area, tenqTier, tenkTier });
  }

  return {
    delta,
    verification: {
      total: changes.length,
      resolved,
      tenqNoMatch,
      tenkNoMatch,
      truncatedQuotes,
      details,
    },
  };
}
