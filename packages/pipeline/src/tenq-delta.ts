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

// Confidence in a parsed section, mirroring FilingMeta.sections[].confidence.
// 'missing' is our local addition for a section the parser didn't emit at all.
export type SectionConfidence = 'high' | 'low' | 'failed' | 'missing';

export type TenqDeltaSourceText = {
  // Section id → text, for one filing. Missing/empty sections are simply absent.
  mda: string | null;
  riskFactors: string | null;
  // Parser confidence per section, so the pass can refuse to mine a section that
  // failed extraction (e.g. a 10-Q MD&A mis-anchored to Part II) and stamp the
  // limitation on the card. Defaults to 'high' when unknown, preserving prior
  // behavior for callers that don't supply confidence.
  mdaConfidence?: SectionConfidence;
  riskFactorsConfidence?: SectionConfidence;
};

// A section is reliable for change-detection only when it parsed at high or low
// confidence AND has text. 'failed'/'missing' means do not mine it.
function sectionReliable(
  text: string | null,
  confidence: SectionConfidence | undefined,
): boolean {
  if (!text || text.trim().length === 0) return false;
  const c = confidence ?? 'high';
  return c === 'high' || c === 'low';
}

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

function confidenceFor(src: TenqDeltaSourceText, section: string): SectionConfidence | undefined {
  if (section === 'mda') return src.mdaConfidence;
  if (section === 'risk-factors') return src.riskFactorsConfidence;
  return undefined;
}

// Build the per-filing text block for the prompt. A section that failed
// extraction is NOT pasted as if it were real content — instead we emit an
// explicit DO-NOT-USE marker so the model is told (not left to infer) that the
// text is unreliable and must not be mined. This makes the MSFT-style "model
// happened to notice the garbage" save a guarantee rather than luck.
function buildFilingBlock(label: string, src: TenqDeltaSourceText): string {
  const parts: string[] = [`### ${label}`];
  for (const section of COMPARED_SECTIONS) {
    const text = sectionTextFor(src, section);
    const reliable = sectionReliable(text, confidenceFor(src, section));
    parts.push(`\n#### section id: ${section}`);
    if (!text || text.trim().length === 0) {
      parts.push('(not available in this filing — do not invent changes for this section)');
    } else if (!reliable) {
      parts.push(
        `(UNRELIABLE: this section failed extraction and the text below is mis-parsed — ` +
          `DO NOT use it as a source of changes or citations. Do not report any change whose ` +
          `citation would come from this section.)`,
      );
    } else {
      parts.push(text);
    }
  }
  return parts.join('\n');
}

// Human label for a section id, for warning text.
const SECTION_LABEL: Record<string, string> = {
  mda: 'MD&A',
  'risk-factors': 'risk factors',
};

// Derive coverage warnings and which sections were actually assessable. We key
// off the 10-Q (quarter) side — that's the document whose changes we mine — but
// also warn if the 10-K baseline section is unusable. mdaAssessed gates the
// headline so the count states honest scope.
function computeCoverage(
  tenqText: TenqDeltaSourceText,
  tenkText: TenqDeltaSourceText,
): { coverageWarnings: string[]; mdaAssessed: boolean } {
  const warnings: string[] = [];
  let mdaAssessed = true;

  for (const section of COMPARED_SECTIONS) {
    const label = SECTION_LABEL[section] ?? section;
    const qReliable = sectionReliable(sectionTextFor(tenqText, section), confidenceFor(tenqText, section));
    const kReliable = sectionReliable(sectionTextFor(tenkText, section), confidenceFor(tenkText, section));
    if (!qReliable) {
      const conf = confidenceFor(tenqText, section) ?? 'missing';
      warnings.push(
        `10-Q ${label} incompletely parsed (section ${conf === 'missing' ? 'missing' : 'failed extraction'}) — ` +
          `${label} change detection not performed.`,
      );
      if (section === 'mda') mdaAssessed = false;
    } else if (!kReliable) {
      const conf = confidenceFor(tenkText, section) ?? 'missing';
      warnings.push(
        `10-K baseline ${label} incompletely parsed (section ${conf === 'missing' ? 'missing' : 'failed extraction'}) — ` +
          `${label} changes could not be compared against the annual baseline.`,
      );
      if (section === 'mda') mdaAssessed = false;
    }
  }
  return { coverageWarnings: warnings, mdaAssessed };
}

// Scope the headline count to what was assessed. When MD&A wasn't assessed, the
// changes can only be risk-factor changes, so say so in the count itself.
function buildHeadline(changeCount: number, mdaAssessed: boolean): string {
  const noun = changeCount === 1 ? 'change' : 'changes';
  if (mdaAssessed) return `${changeCount} ${noun}`;
  const rfNoun = changeCount === 1 ? 'risk-factor change' : 'risk-factor changes';
  return `${changeCount} ${rfNoun}; MD&A not assessed`;
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

  // Coverage stamp. A depended-on section is "unreliable" when the 10-Q's copy
  // of it failed extraction (the comparison's quarter side is what we mine; a
  // bad 10-K baseline is rarer but flagged too). We compute warnings + a scoped
  // headline from confidence — never from the model — so the count on the card
  // states what was actually assessed.
  const { coverageWarnings, mdaAssessed } = computeCoverage(tenqText, tenkText);
  const headline = buildHeadline(changes.length, mdaAssessed);

  const delta: TenqDelta = {
    tenqAccession: tenqMeta.accession,
    tenqFilingDate: tenqMeta.filingDate,
    tenkAccession: tenkMeta.accession,
    tenkFilingDate: tenkMeta.filingDate,
    summary: out.summary,
    changes,
    headline,
    coverageWarnings,
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
