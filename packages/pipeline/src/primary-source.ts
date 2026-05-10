// Primary-source value-investing checklist. Reads the latest 10-K and DEF
// 14A directly (not analyst extraction), routes the right sections to the
// right dimension, and runs three LLM passes:
//   Pass 1: scoring against the rubric, with citations
//   Pass 2: skeptic-mode rebuttal (separate prompt; sees only Pass 1 scores)
//   Pass 3: judge call that reconciles the two
// All three calls are cached via the LLM cache namespace, keyed by the
// prompt-text hash so editing a prompt invalidates only its pass.

import { z } from 'zod';
import {
  isInsufficientPrimary,
  PrimarySourceChecklist,
  PrimarySourceJudgment,
  PrimarySourceSkeptic,
  PRIMARY_DIMENSION_KEYS,
  type FinancialSnapshot,
  type PrimaryDimensionKey,
  type ReverseDcfReport,
} from '@stock-vetter/schema';
import { llmCallJson, newCostTracker, type CostTracker } from './llm.js';
import { loadPrompt } from './prompts.js';
import { fetchAndParseFiling, fetchLatestProxy, type FilingMeta } from './sec-filings.js';
import { fetchFinancialSnapshot } from './financials.js';
import { buildReverseDcf } from './reverse-dcf.js';
import { getLlmOutput, putLlmOutput, hashInputs } from './cache.js';

// Dimensions where valuation context (current vs historical multiples,
// reverse DCF) materially informs reasoning. Insider-alignment, moat, and
// cyclicality are about business/governance characteristics — adding price
// context just dilutes them. Owner-earnings, capital-allocation, and
// debt-sustainability all benefit.
const VALUATION_AWARE_DIMENSIONS = new Set<PrimaryDimensionKey>([
  'ownerEarningsQuality',
  'capitalAllocation',
  'debtSustainability',
]);

// Render a compact "Financial context" block that gets prepended to
// valuation-aware dimensions' prompts. Numbers only — no LLM commentary,
// keeping it ground-truth substrate the model can reason against.
function renderFinancialContext(
  snapshot: FinancialSnapshot | null,
  dcf: ReverseDcfReport | null,
): string {
  if (!snapshot) return '';
  const parts: string[] = [];
  parts.push('### Financial context (computed from SEC + Yahoo, not LLM-generated)');
  parts.push('');
  parts.push(`- Price: $${snapshot.price.toFixed(2)}`);
  parts.push(`- Market cap: $${(snapshot.marketCap / 1e9).toFixed(1)}B`);
  parts.push(`- Enterprise value: $${(snapshot.enterpriseValue / 1e9).toFixed(1)}B`);
  parts.push(`- Net cash: $${(snapshot.netCash / 1e9).toFixed(1)}B`);
  parts.push(`- Trailing P/E: ${snapshot.peRatio?.toFixed(1) ?? 'n/a'}`);
  parts.push(`- 10y median P/E: ${snapshot.peRatio10yMedian?.toFixed(1) ?? 'n/a'}`);
  parts.push(`- Trailing EV/EBIT: ${snapshot.evEbit?.toFixed(1) ?? 'n/a'}`);
  parts.push(`- 10y median EV/EBIT: ${snapshot.evEbit10yMedian?.toFixed(1) ?? 'n/a'}`);
  parts.push(`- Trailing FCF yield: ${snapshot.fcfYield != null ? `${(snapshot.fcfYield * 100).toFixed(2)}%` : 'n/a'}`);
  if (dcf) {
    const central = dcf.grid.find((c) => Math.abs(c.discountRate - 0.10) < 1e-6 && c.terminalMultiple === 20);
    if (central?.impliedFcfCagr != null) {
      parts.push(`- Reverse DCF implied 10y FCF CAGR (10% disc, 20× terminal): ${(central.impliedFcfCagr * 100).toFixed(1)}%`);
    }
    if (dcf.actualFcfCagr5y != null) {
      parts.push(`- Actual 5y FCF CAGR: ${(dcf.actualFcfCagr5y * 100).toFixed(1)}%`);
    }
    if (dcf.actualFcfCagr3y != null) {
      parts.push(`- Actual 3y FCF CAGR: ${(dcf.actualFcfCagr3y * 100).toFixed(1)}%`);
    }
  }
  parts.push('');
  return parts.join('\n');
}

const SingleDimensionSchema = z.union([
  z.object({
    score: z.number().min(1).max(10),
    rationale: z.string(),
    citations: z
      .array(
        z.object({
          section: z.string(),
          quote: z.string(),
          whyItMatters: z.string(),
        }),
      )
      .min(2),
    counterEvidence: z.string(),
  }),
  z.object({
    score: z.literal('insufficient'),
    reason: z.string(),
  }),
]);

// Section routing: which sections feed which dimension. When a section is
// `bundled` into another, the bundled targets are also included so the
// LLM has the full content available.
//
// Special section ids:
//   "proxy" — the cleaned DEF 14A text (no Item-N structure)
const DIMENSION_SECTIONS: Record<PrimaryDimensionKey, string[]> = {
  moatDurability: ['business', 'risk-factors'],
  ownerEarningsQuality: ['financial-statements', 'mda'],
  capitalAllocation: ['mda', 'financial-statements'],
  debtSustainability: ['financial-statements', 'mda'],
  insiderAlignment: ['proxy'],
  cyclicalityAwareness: ['risk-factors', 'mda'],
};

// Crude character budget per dimension. Anthropic's per-org input-tokens-
// per-minute rate limit is the binding constraint, not Sonnet 4.6's context
// window. At ~4 chars/token, 80K chars ≈ 20K tokens — comfortably under the
// 30K/min limit per call, and lets all six dimension calls fit in roughly
// the same minute.
//
// 80K chars is enough for: full Business section on most filers, the most
// pertinent third of a long Risk Factors section, full MD&A on most filers.
// For very large bundled filings (JPM's MD&A+Item 8 chunk is 994K) we'll
// truncate aggressively — the LLM gets the head of the section, which
// contains the auditor's report and the major statements; the deep notes
// are sacrificed for v1. Future improvement: section-aware chunking that
// picks the most relevant sub-sections per dimension.
const PER_DIMENSION_BUDGET = 80_000;

type SectionLoader = (id: string) => Promise<string | null>;

async function loadDimensionContext(
  filingMeta: FilingMeta,
  getSection: SectionLoader,
  proxyText: string | null,
  dimension: PrimaryDimensionKey,
): Promise<{ context: string; sourcesUsed: string[] }> {
  const requested = DIMENSION_SECTIONS[dimension];
  // Resolve bundled expansions: if a requested section is bundled into
  // another, include the bundled target's content too.
  const sectionLookup = new Map(filingMeta.sections.map((s) => [s.id, s]));
  const expanded = new Set<string>();
  for (const id of requested) {
    expanded.add(id);
    const sec = sectionLookup.get(id);
    if (sec?.bundled) {
      for (const b of sec.bundled) expanded.add(b);
    }
  }

  const parts: string[] = [];
  const used: string[] = [];
  let totalChars = 0;
  for (const id of expanded) {
    if (id === 'proxy') {
      if (!proxyText) continue;
      // Proxy statements are typically 300K-500K chars and dominated by
      // boilerplate. The insider-alignment-relevant content (Beneficial
      // Ownership tables, Compensation Discussion and Analysis, Related-
      // Party Transactions) starts ~30-40% into the document on most
      // filers. As a v1 heuristic, take a window from 30% in for ~60K
      // chars, which usually catches the ownership table and the start of
      // the comp discussion. Future improvement: section-aware proxy
      // parser. The 60K cap also keeps us under the per-dimension budget
      // when proxy is the only routed source (insider-alignment).
      const startOffset = Math.floor(proxyText.length * 0.3);
      const slice = proxyText.slice(startOffset, startOffset + 60_000);
      const remaining = PER_DIMENSION_BUDGET - totalChars;
      const take = slice.slice(0, Math.max(0, remaining));
      if (take.length) {
        parts.push(`### proxy (DEF 14A, ${take.length.toLocaleString()} chars window starting at offset ${startOffset.toLocaleString()} of ${proxyText.length.toLocaleString()})\n\n${take}`);
        totalChars += take.length;
        used.push('proxy');
      }
      continue;
    }
    const body = await getSection(id);
    if (!body) continue;
    const remaining = PER_DIMENSION_BUDGET - totalChars;
    if (remaining <= 0) break;
    const take = body.slice(0, remaining);
    parts.push(
      `### ${id} (${take.length.toLocaleString()} chars` +
        (take.length < body.length ? ` of ${body.length.toLocaleString()}, truncated` : '') +
        `)\n\n${take}`,
    );
    totalChars += take.length;
    used.push(id);
  }
  return { context: parts.join('\n\n---\n\n'), sourcesUsed: used };
}

export type PrimarySourceRunOptions = {
  tracker?: CostTracker;
  onProgress?: (stage: string, costSoFar: number) => void;
};

// Pass 1 only. Returns the parsed PrimarySourceChecklist. Each dimension is
// scored in its own LLM call so that (a) the model sees only the
// dimension-routed sections (avoiding the moat-laundering risk), and
// (b) we can cache per-dimension and skip re-running stable dimensions
// when only one dimension's prompt was edited.
export async function runPrimarySourcePass1(
  ticker: string,
  options: PrimarySourceRunOptions & {
    snapshot?: FinancialSnapshot | null;
    dcf?: ReverseDcfReport | null;
  } = {},
): Promise<PrimarySourceChecklist> {
  const tracker = options.tracker ?? newCostTracker(options.onProgress
    ? (t) => options.onProgress!('primary-source', t)
    : undefined);
  const { meta, getSection } = await fetchAndParseFiling(ticker, '10-K');
  const proxy = await fetchLatestProxy(ticker);
  const proxyText = proxy?.cleanedText ?? null;
  const promptText = await loadPrompt('primary-source-checklist');
  // Pre-load financial context if not provided (callers from analyze-ticker
  // already have it; standalone callers don't).
  const snapshot = options.snapshot ?? (await fetchFinancialSnapshot(ticker));
  const dcf = options.dcf ?? (snapshot ? buildReverseDcf(snapshot) : null);
  const financialContext = renderFinancialContext(snapshot, dcf);

  // Triple-sample Pass 1: each dimension is scored 3x in parallel. The
  // returned value uses the median score and the rationale/citations from
  // whichever sample's score was closest to the median ("representative
  // sample"). The range (max - min across the 3 numeric samples) is
  // surfaced as a confidence indicator. Subsequent passes (skeptic, judge)
  // see only the median — they treat Pass 1's output as a single score, as
  // before, but the meta-card consumes the variance to weight dimensions.
  const SAMPLES_PER_DIMENSION = 3;

  type SingleSampleOutput = z.infer<typeof SingleDimensionSchema>;

  async function runOneSample(
    key: PrimaryDimensionKey,
    sampleIndex: number,
    context: string,
    sourcesUsed: string[],
    includeFinancial: boolean,
  ): Promise<SingleSampleOutput> {
    const inputHash = hashInputs({
      ticker: ticker.toUpperCase(),
      accession: meta.accession,
      proxyAccession: proxy?.accession ?? null,
      dimension: key,
      sourcesUsed,
      contextLength: context.length,
      financialContextDate: includeFinancial ? snapshot?.asOf : null,
      sampleIndex,
    });
    const cached = await getLlmOutput<SingleSampleOutput>(`ps1-${key}`, inputHash, promptText);
    if (cached) return cached;
    // Add a "Sample N of 3" marker to the user message so the model isn't
    // pattern-matching to identical prompts. The variance we want comes from
    // the model's natural sampling stochasticity, not from prompt drift, so
    // the marker is the only difference between samples.
    const userMessage =
      `Score the following dimension only: **${key}** (independent sample ${sampleIndex + 1} of ${SAMPLES_PER_DIMENSION})\n\n` +
      `Ticker: ${ticker.toUpperCase()}\n` +
      `Filing: 10-K accession ${meta.accession} (${meta.filingDate})\n` +
      (proxy ? `Proxy: DEF 14A accession ${proxy.accession} (${proxy.filingDate})\n` : '') +
      (includeFinancial ? `\n${financialContext}` : '') +
      `\nPrimary-source sections (do not invent content from sections not provided):\n\n${context}\n\n` +
      `Return JSON for ONLY this dimension, in the shape:\n` +
      `{ "score": <1-10 number or "insufficient">, "rationale": "...", "citations": [{"section": "...", "quote": "...", "whyItMatters": "..."}], "counterEvidence": "..." }\n` +
      `(Or for insufficient: { "score": "insufficient", "reason": "..." })\n` +
      `Output JSON only.`;
    const result = await llmCallJson({
      stage: `primary-source-${key}-s${sampleIndex}`,
      systemPrompt: promptText,
      userMessage,
      schema: SingleDimensionSchema,
      maxTokens: 4096,
      tracker,
    });
    await putLlmOutput(`ps1-${key}`, inputHash, promptText, result);
    return result;
  }

  // Median across an odd-length array (we always send 3 samples, but some may
  // come back insufficient — the numeric subset can be any length 1-3).
  function medianOf(nums: number[]): number {
    if (nums.length === 0) return Number.NaN;
    const sorted = [...nums].sort((a, b) => a - b);
    const mid = sorted.length >>> 1;
    return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
  }

  const dimensionResults: Record<string, unknown> = {};
  for (const key of PRIMARY_DIMENSION_KEYS) {
    options.onProgress?.(`primary-source:${key}`, tracker.total);
    const { context, sourcesUsed } = await loadDimensionContext(meta, getSection, proxyText, key);
    if (!context.length) {
      dimensionResults[key] = { score: 'insufficient', reason: `No primary-source content available for ${key} (sections: ${DIMENSION_SECTIONS[key].join(', ')})` };
      continue;
    }
    const includeFinancial = VALUATION_AWARE_DIMENSIONS.has(key) && financialContext.length > 0;
    // Run all 3 samples in parallel. Cache hits return immediately; only
    // un-cached samples actually call the API. The 30K-input-tokens-per-min
    // rate limit applies to the parallel calls; at ~20K tokens per call ×
    // 3 = 60K, we'll trigger the 429 retry-with-backoff for the 2nd or 3rd
    // sample if all are fresh — this is fine, they retry automatically.
    const samples = await Promise.all(
      Array.from({ length: SAMPLES_PER_DIMENSION }, (_, i) =>
        runOneSample(key, i, context, sourcesUsed, includeFinancial),
      ),
    );
    // Partition samples into numeric scores vs insufficient.
    const numericIndices: number[] = [];
    const numericScores: number[] = [];
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i]!;
      if (typeof s.score === 'number') {
        numericIndices.push(i);
        numericScores.push(s.score);
      }
    }
    if (numericScores.length === 0) {
      // All 3 came back insufficient — collapse to the first one's reason.
      const first = samples[0]! as { score: 'insufficient'; reason: string };
      dimensionResults[key] = first;
      continue;
    }
    const median = medianOf(numericScores);
    const range = Math.max(...numericScores) - Math.min(...numericScores);
    // Pick the representative sample: numeric sample whose score is closest
    // to the median. This is the rationale/citations we surface to the user
    // and that Pass 2/Pass 3 use as Pass 1 reasoning.
    let bestIdx = numericIndices[0]!;
    let bestDist = Math.abs(numericScores[0]! - median);
    for (let i = 1; i < numericIndices.length; i++) {
      const d = Math.abs(numericScores[i]! - median);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = numericIndices[i]!;
      }
    }
    const representative = samples[bestIdx]! as Extract<SingleSampleOutput, { score: number }>;
    dimensionResults[key] = {
      score: median,
      rationale: representative.rationale,
      citations: representative.citations,
      counterEvidence: representative.counterEvidence,
      samples: numericScores,
      range,
      representativeSampleIndex: bestIdx,
    };
  }

  const checklist: PrimarySourceChecklist = {
    ticker: ticker.toUpperCase(),
    filingAccession: meta.accession,
    scores: dimensionResults as PrimarySourceChecklist['scores'],
  };
  // Validate the assembled object against the schema as a final sanity check.
  return PrimarySourceChecklist.parse(checklist);
}

// ---- Pass 2: skeptic ----

const SkepticDimensionSchema = z.object({
  rebuttal: z.string(),
  citations: z.array(
    z.object({
      section: z.string(),
      quote: z.string(),
      whyItMatters: z.string(),
    }),
  ),
  recommendedAdjustment: z.number().min(-3).max(1.5),
});

// Pass 2: per-dimension skeptic call. Sees ONLY the Pass 1 numerical score
// (not its reasoning/citations) plus the same primary-source sections. The
// "see only the score" constraint is structural: if the skeptic saw Pass 1's
// reasoning, it would just rebut the reasoning rather than building an
// independent counter-case from sources. Forcing it to start from sources
// produces genuinely different evidence.
export async function runPrimarySourcePass2(
  ticker: string,
  pass1: PrimarySourceChecklist,
  options: PrimarySourceRunOptions & {
    snapshot?: FinancialSnapshot | null;
    dcf?: ReverseDcfReport | null;
  } = {},
): Promise<PrimarySourceSkeptic> {
  const tracker = options.tracker ?? newCostTracker(options.onProgress
    ? (t) => options.onProgress!('primary-source-skeptic', t)
    : undefined);
  const { meta, getSection } = await fetchAndParseFiling(ticker, '10-K');
  const proxy = await fetchLatestProxy(ticker);
  const proxyText = proxy?.cleanedText ?? null;
  const promptText = await loadPrompt('primary-source-skeptic');
  const snapshot = options.snapshot ?? (await fetchFinancialSnapshot(ticker));
  const dcf = options.dcf ?? (snapshot ? buildReverseDcf(snapshot) : null);
  const financialContext = renderFinancialContext(snapshot, dcf);

  const rebuttalResults: Record<string, unknown> = {};
  for (const key of PRIMARY_DIMENSION_KEYS) {
    options.onProgress?.(`primary-source-skeptic:${key}`, tracker.total);
    const { context, sourcesUsed } = await loadDimensionContext(meta, getSection, proxyText, key);
    if (!context.length) {
      rebuttalResults[key] = {
        rebuttal: 'No primary-source content available to evaluate.',
        citations: [],
        recommendedAdjustment: 0,
      };
      continue;
    }
    // Render the Pass 1 score and the counter-evidence Pass 1 already
    // articulated. The skeptic uses the counter-evidence section to
    // perform a no-counter-evidence pre-check: if Pass 1 already named
    // the concern the skeptic would raise, recommend 0. We deliberately
    // continue to omit Pass 1's rationale and citations so the skeptic's
    // own evidence-gathering remains independent.
    const pass1Dim = pass1.scores[key];
    const pass1ScoreOnly = isInsufficientPrimary(pass1Dim) ? 'insufficient' : pass1Dim.score;
    const pass1CounterEvidence = isInsufficientPrimary(pass1Dim) ? '' : pass1Dim.counterEvidence;

    const includeFinancial = VALUATION_AWARE_DIMENSIONS.has(key) && financialContext.length > 0;
    const inputHash = hashInputs({
      ticker: ticker.toUpperCase(),
      accession: meta.accession,
      proxyAccession: proxy?.accession ?? null,
      dimension: key,
      pass1ScoreOnly, // include in cache key so re-running with a different Pass 1 score invalidates
      pass1CounterEvidenceLen: pass1CounterEvidence.length,
      sourcesUsed,
      contextLength: context.length,
      financialContextDate: includeFinancial ? snapshot?.asOf : null,
    });
    const cached = await getLlmOutput<unknown>(`ps2-${key}`, inputHash, promptText);
    if (cached) {
      rebuttalResults[key] = cached;
      continue;
    }
    const userMessage =
      `Audit the following dimension only: **${key}**\n\n` +
      `Ticker: ${ticker.toUpperCase()}\n` +
      `Filing: 10-K accession ${meta.accession} (${meta.filingDate})\n` +
      (proxy ? `Proxy: DEF 14A accession ${proxy.accession} (${proxy.filingDate})\n` : '') +
      (includeFinancial ? `\n${financialContext}` : '') +
      `\n--- Pass 1 score ---\n${pass1ScoreOnly}\n` +
      `\n--- Pass 1 counter-evidence (concerns already considered; do not re-raise these) ---\n` +
      (pass1CounterEvidence || '(none provided)') +
      `\n\n--- Primary-source sections ---\n\n${context}\n\n` +
      `Return JSON for ONLY this dimension, in the shape:\n` +
      `{ "rebuttal": "...", "citations": [{"section": "...", "quote": "...", "whyItMatters": "..."}], "recommendedAdjustment": <number from -3.0 to +1.5; default 0> }\n` +
      `Remember: 0 is the expected default. Only deviate if you have specific primary-source evidence Pass 1's counter-evidence section did not address.\n` +
      `Output JSON only.`;
    const result = await llmCallJson({
      stage: `primary-source-skeptic-${key}`,
      systemPrompt: promptText,
      userMessage,
      schema: SkepticDimensionSchema,
      maxTokens: 3072,
      tracker,
    });
    await putLlmOutput(`ps2-${key}`, inputHash, promptText, result);
    rebuttalResults[key] = result;
  }

  const skeptic: PrimarySourceSkeptic = {
    ticker: ticker.toUpperCase(),
    filingAccession: meta.accession,
    rebuttals: rebuttalResults as PrimarySourceSkeptic['rebuttals'],
  };
  return PrimarySourceSkeptic.parse(skeptic);
}

// ---- Pass 3: judge ----

const JudgeDimensionSchema = z.object({
  finalScore: z.number().min(1).max(10),
  decision: z.enum(['agreed-with-pass1', 'agreed-with-pass2', 'split', 'no-change']),
  justification: z.string(),
});

// Pass 3 sees BOTH Pass 1 (full output: score + reasoning + citations) AND
// Pass 2 (rebuttal + citations + recommendedAdjustment), plus the original
// primary-source sections. Frames as judge: which side's evidence is
// stronger? Outputs final scores per dimension.
export async function runPrimarySourcePass3(
  ticker: string,
  pass1: PrimarySourceChecklist,
  pass2: PrimarySourceSkeptic,
  options: PrimarySourceRunOptions & {
    snapshot?: FinancialSnapshot | null;
    dcf?: ReverseDcfReport | null;
  } = {},
): Promise<PrimarySourceJudgment> {
  const tracker = options.tracker ?? newCostTracker(options.onProgress
    ? (t) => options.onProgress!('primary-source-judge', t)
    : undefined);
  const { meta, getSection } = await fetchAndParseFiling(ticker, '10-K');
  const proxy = await fetchLatestProxy(ticker);
  const proxyText = proxy?.cleanedText ?? null;
  const promptText = await loadPrompt('primary-source-judge');
  const snapshot = options.snapshot ?? (await fetchFinancialSnapshot(ticker));
  const dcf = options.dcf ?? (snapshot ? buildReverseDcf(snapshot) : null);
  const financialContext = renderFinancialContext(snapshot, dcf);

  const judgments: Record<string, unknown> = {};
  for (const key of PRIMARY_DIMENSION_KEYS) {
    options.onProgress?.(`primary-source-judge:${key}`, tracker.total);
    const { context, sourcesUsed } = await loadDimensionContext(meta, getSection, proxyText, key);
    if (!context.length) {
      judgments[key] = {
        finalScore: 5.5,
        decision: 'no-change',
        justification: 'No primary-source content available; default to neutral midpoint.',
      };
      continue;
    }
    const pass1Dim = pass1.scores[key];
    const pass2Dim = pass2.rebuttals[key];

    const includeFinancial = VALUATION_AWARE_DIMENSIONS.has(key) && financialContext.length > 0;
    const inputHash = hashInputs({
      ticker: ticker.toUpperCase(),
      accession: meta.accession,
      dimension: key,
      pass1: pass1Dim,
      pass2: pass2Dim,
      sourcesUsed,
      contextLength: context.length,
      financialContextDate: includeFinancial ? snapshot?.asOf : null,
    });
    const cached = await getLlmOutput<unknown>(`ps3-${key}`, inputHash, promptText);
    if (cached) {
      judgments[key] = cached;
      continue;
    }
    // Render Pass 1 for the judge: full score, rationale, citations,
    // counter-evidence. The judge is supposed to see the whole picture.
    const pass1Render = isInsufficientPrimary(pass1Dim)
      ? `Pass 1 marked this dimension "insufficient": ${pass1Dim.reason}`
      : `Pass 1 score: ${pass1Dim.score}\n` +
        `Pass 1 rationale: ${pass1Dim.rationale}\n` +
        `Pass 1 citations:\n` +
        pass1Dim.citations
          .map((c, i) => `  [${i}] (${c.section}) "${c.quote}" — ${c.whyItMatters}`)
          .join('\n') +
        `\nPass 1 counter-evidence: ${pass1Dim.counterEvidence}`;
    const pass2Render =
      `Pass 2 rebuttal: ${pass2Dim.rebuttal}\n` +
      `Pass 2 citations:\n` +
      pass2Dim.citations
        .map((c, i) => `  [${i}] (${c.section}) "${c.quote}" — ${c.whyItMatters}`)
        .join('\n') +
      `\nPass 2 recommended adjustment: ${pass2Dim.recommendedAdjustment}`;
    const userMessage =
      `Judge the following dimension only: **${key}**\n\n` +
      `Ticker: ${ticker.toUpperCase()}\n` +
      `Filing: 10-K accession ${meta.accession} (${meta.filingDate})\n` +
      (includeFinancial ? `\n${financialContext}` : '') +
      `\n--- Pass 1 (original) ---\n${pass1Render}\n` +
      `\n--- Pass 2 (skeptic) ---\n${pass2Render}\n` +
      `\n--- Primary-source sections (verify either side's citations against these) ---\n\n${context}\n\n` +
      `Return JSON for ONLY this dimension:\n` +
      `{ "finalScore": <1-10>, "decision": "agreed-with-pass1"|"agreed-with-pass2"|"split"|"no-change", "justification": "..." }\n` +
      `Output JSON only.`;
    const result = await llmCallJson({
      stage: `primary-source-judge-${key}`,
      systemPrompt: promptText,
      userMessage,
      schema: JudgeDimensionSchema,
      maxTokens: 1024,
      tracker,
    });
    await putLlmOutput(`ps3-${key}`, inputHash, promptText, result);
    judgments[key] = result;
  }

  const judgment: PrimarySourceJudgment = {
    ticker: ticker.toUpperCase(),
    filingAccession: meta.accession,
    finalScores: judgments as PrimarySourceJudgment['finalScores'],
  };
  return PrimarySourceJudgment.parse(judgment);
}

// Convenience wrapper: run all three passes sequentially. Loads the
// financial snapshot + reverse DCF once and threads them through all
// three passes so we don't re-fetch from Yahoo three times.
export async function runPrimarySourceFull(
  ticker: string,
  options: PrimarySourceRunOptions & {
    snapshot?: FinancialSnapshot | null;
    dcf?: ReverseDcfReport | null;
  } = {},
): Promise<{
  pass1: PrimarySourceChecklist;
  pass2: PrimarySourceSkeptic;
  pass3: PrimarySourceJudgment;
}> {
  const snapshot = options.snapshot ?? (await fetchFinancialSnapshot(ticker));
  const dcf = options.dcf ?? (snapshot ? buildReverseDcf(snapshot) : null);
  const opts = { ...options, snapshot, dcf };
  const pass1 = await runPrimarySourcePass1(ticker, opts);
  const pass2 = await runPrimarySourcePass2(ticker, pass1, opts);
  const pass3 = await runPrimarySourcePass3(ticker, pass1, pass2, opts);
  return { pass1, pass2, pass3 };
}
