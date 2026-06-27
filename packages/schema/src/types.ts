import { z } from 'zod';

export const Citation = z.object({
  startSec: z.number(),
  endSec: z.number(),
});
export type Citation = z.infer<typeof Citation>;

export const Chapter = z.object({
  title: z.string(),
  startSec: z.number(),
});
export type Chapter = z.infer<typeof Chapter>;

export const TranscriptCue = z.object({
  startSec: z.number(),
  endSec: z.number(),
  text: z.string(),
});
export type TranscriptCue = z.infer<typeof TranscriptCue>;

export const VideoBundle = z.object({
  videoId: z.string(),
  title: z.string(),
  channel: z.string(),
  channelId: z.string(),
  publishedAt: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  chapters: z.array(Chapter),
  transcript: z.array(TranscriptCue),
  durationSeconds: z.number(),
});
export type VideoBundle = z.infer<typeof VideoBundle>;

export const AnnualRow = z.object({
  year: z.number(),
  revenue: z.number(),
  ebit: z.number(),
  netIncome: z.number(),
  fcf: z.number(),
  sharesOutstanding: z.number(),
  // Long-term debt at year end. Used (with year-end share count and historical
  // close price) to compute approximate historical enterprise value, which in
  // turn feeds peRatio10yMedian and evEbit10yMedian. Null when SEC didn't
  // disclose a clean LongTermDebtNoncurrent figure for the year.
  longTermDebt: z.number().nullable().optional(),
  roic: z.number().nullable(),
  debtToEquity: z.number().nullable(),
});
export type AnnualRow = z.infer<typeof AnnualRow>;

export const FinancialSnapshot = z.object({
  ticker: z.string(),
  asOf: z.string(),
  price: z.number(),
  marketCap: z.number(),
  enterpriseValue: z.number(),
  netCash: z.number(),
  peRatio: z.number().nullable(),
  evEbit: z.number().nullable(),
  evSales: z.number().nullable(),
  fcfYield: z.number().nullable(),
  peRatio10yMedian: z.number().nullable(),
  evEbit10yMedian: z.number().nullable(),
  annual: z.array(AnnualRow),
  isProfitable: z.boolean(),
  hasPositiveFcf: z.boolean(),
  shareCountTrend: z.enum(['shrinking', 'flat', 'growing']),
});
export type FinancialSnapshot = z.infer<typeof FinancialSnapshot>;

export const Severity = z.enum(['low', 'medium', 'high']);
export type Severity = z.infer<typeof Severity>;

export const ThreatLevel = z.enum(['low', 'medium', 'high']);
export type ThreatLevel = z.infer<typeof ThreatLevel>;

export const Confidence = z.enum(['low', 'medium', 'high']);
export type Confidence = z.infer<typeof Confidence>;

export const ExtractedAnalysis = z.object({
  ticker: z.string(),
  companyName: z.string(),
  analyst: z.string(),
  videoDate: z.string(),
  thesisOneLiner: z.string(),
  segments: z.array(
    z.object({
      name: z.string(),
      revenue: z.number().nullable().optional(),
      ebit: z.number().nullable().optional(),
      growthRate: z.number().nullable().optional(),
      keyDrivers: z.array(z.string()),
      citation: Citation,
    }),
  ),
  competitiveLandscape: z.array(
    z.object({
      competitor: z.string(),
      threatLevel: ThreatLevel,
      analystView: z.string(),
      citation: Citation,
    }),
  ),
  risks: z.array(
    z.object({
      risk: z.string(),
      severity: Severity,
      analystAddressedWell: z.boolean(),
      citation: Citation,
    }),
  ),
  valuation: z.object({
    method: z.string(),
    timeHorizonYears: z.number(),
    keyAssumptions: z.array(
      z.object({
        assumption: z.string(),
        value: z.string(),
        analystConfidence: Confidence,
        citation: Citation,
      }),
    ),
    // LLMs vary in whether they omit or null absent fields; accept both.
    // Many value investors (Drew Cohen, Buffett-style) work in implied-
    // return terms without an explicit price target, or vice versa.
    impliedReturn: z.object({ low: z.number(), high: z.number() }).nullable().optional(),
    impliedPriceTarget: z.number().nullable().optional(),
  }),
  qualitativeFactors: z.object({
    managementQuality: z.string(),
    moat: z.string(),
    // LLMs vary in whether they omit or null absent fields; accept both.
    insiderOwnership: z.string().nullable().optional(),
    capitalAllocation: z.string(),
  }),
});
export type ExtractedAnalysis = z.infer<typeof ExtractedAnalysis>;

export const FindingType = z.enum(['agree', 'partial', 'disagree', 'missing']);
export type FindingType = z.infer<typeof FindingType>;

export const FindingSeverity = z.enum(['nit', 'concern', 'blocker']);
export type FindingSeverity = z.infer<typeof FindingSeverity>;

export const CritiqueFinding = z.object({
  type: FindingType,
  topic: z.string(),
  analystClaim: z.string(),
  llmPushback: z.string(),
  severity: FindingSeverity,
  evidence: z.string(),
});
export type CritiqueFinding = z.infer<typeof CritiqueFinding>;

export const StressTestFinding = z.object({
  assumption: z.string(),
  baseValue: z.string(),
  bearCase: z.object({
    value: z.string(),
    rationale: z.string(),
    impliedReturnDelta: z.number(),
  }),
  bullCase: z.object({
    value: z.string(),
    rationale: z.string(),
    impliedReturnDelta: z.number(),
  }),
  sensitivity: z.enum(['low', 'medium', 'high']),
});
export type StressTestFinding = z.infer<typeof StressTestFinding>;

export const ChecklistScore = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);
export type ChecklistScore = z.infer<typeof ChecklistScore>;

export const ValueChecklistItem = z.object({
  score: ChecklistScore,
  rationale: z.string(),
});
export type ValueChecklistItem = z.infer<typeof ValueChecklistItem>;

export const ValueChecklist = z.object({
  moatDurability: ValueChecklistItem,
  ownerEarningsQuality: ValueChecklistItem,
  capitalAllocation: ValueChecklistItem,
  insiderAlignment: ValueChecklistItem,
  debtSustainability: ValueChecklistItem,
  cyclicalityAwareness: ValueChecklistItem,
});
export type ValueChecklist = z.infer<typeof ValueChecklist>;

export const Critiques = z.object({
  consistency: z.array(CritiqueFinding),
  stressTest: z.array(StressTestFinding),
  comps: z.array(CritiqueFinding),
  missingRisks: z.array(CritiqueFinding),
  valueChecklist: ValueChecklist,
});
export type Critiques = z.infer<typeof Critiques>;

export const ScoredDimension = z.union([
  z.object({
    value: z.number(),
    rationale: z.string(),
    citations: z.array(z.string()),
  }),
  z.object({
    value: z.literal('insufficient'),
    reason: z.string(),
  }),
]);
export type ScoredDimension = z.infer<typeof ScoredDimension>;

export const Verdict = z.enum(['Strong Candidate', 'Watchlist', 'Pass', 'Insufficient Data']);
export type Verdict = z.infer<typeof Verdict>;

export const Agreement = z.enum(['agree', 'partial', 'disagree']);
export type Agreement = z.infer<typeof Agreement>;

export const ScoredAnalysis = z.object({
  scores: z.object({
    businessQuality: ScoredDimension,
    financialHealth: ScoredDimension,
    valuationAttractiveness: ScoredDimension,
    marginOfSafety: ScoredDimension,
    analystRigor: ScoredDimension,
  }),
  weightedScore: z.number(),
  verdict: Verdict,
  prosConsTable: z.array(
    z.object({
      topic: z.string(),
      analystView: z.string(),
      llmPushback: z.string(),
      agreement: Agreement,
    }),
  ),
  thingsToVerify: z.array(z.string()),
  realityCheck: z.string().nullable(),
});
export type ScoredAnalysis = z.infer<typeof ScoredAnalysis>;

export const DecisionCard = z.object({
  videoId: z.string(),
  ticker: z.string(),
  channelId: z.string(),
  // Captured from VideoBundle at orchestration time. Free to capture now,
  // expensive to backfill later (the meta-card feature weights analyst rigor
  // by channel, and the web viewer shows the video title/date). Optional so
  // pre-existing cards parse; populated for all new runs.
  channelName: z.string().optional(),
  videoTitle: z.string().optional(),
  publishedAt: z.string().optional(),
  generatedAt: z.string(),
  extraction: ExtractedAnalysis,
  critiques: Critiques,
  scored: ScoredAnalysis,
  financialSnapshot: FinancialSnapshot.nullable(),
});
export type DecisionCard = z.infer<typeof DecisionCard>;

export const DEFAULT_WEIGHTS = {
  marginOfSafety: 0.3,
  valuationAttractiveness: 0.25,
  businessQuality: 0.2,
  financialHealth: 0.15,
  analystRigor: 0.1,
} as const;
export type ScoreWeights = typeof DEFAULT_WEIGHTS;

// ---- Primary-source value checklist (ticker-first workflow, Weekend 2+) ----

export const PrimarySourceCitation = z.object({
  section: z.string(),     // e.g. "risk-factors", "financial-statements", "proxy"
  quote: z.string(),       // 10-30 words verbatim from that section
  whyItMatters: z.string(),
});
export type PrimarySourceCitation = z.infer<typeof PrimarySourceCitation>;

export const ScoredPrimaryDimension = z.object({
  // Median score across N independent Pass 1 samples (typically N=3).
  score: z.number().min(1).max(10),
  rationale: z.string(),
  citations: z.array(PrimarySourceCitation).min(2),
  counterEvidence: z.string(),
  // Triple-sampling fields. Optional for backward compatibility with old
  // single-sample cached outputs.
  // - samples: every numeric score returned by the 3 samples (insufficient
  //   samples are excluded). Length 1 means single-sample fallback.
  // - range: max - min across `samples`. Range > 1.5 = "high uncertainty"
  //   per the meta-card weighting policy.
  // - representativeSampleIndex: which sample's rationale/citations were
  //   surfaced (the one whose score is closest to the median). 0-indexed.
  samples: z.array(z.number()).optional(),
  range: z.number().optional(),
  representativeSampleIndex: z.number().int().min(0).optional(),
});
export const InsufficientPrimaryDimension = z.object({
  score: z.literal('insufficient'),
  reason: z.string(),
});
export const PrimaryDimensionScore = z.union([
  ScoredPrimaryDimension,
  InsufficientPrimaryDimension,
]);
export type PrimaryDimensionScore = z.infer<typeof PrimaryDimensionScore>;

export const PrimarySourceChecklist = z.object({
  ticker: z.string(),
  filingAccession: z.string(),
  scores: z.object({
    moatDurability: PrimaryDimensionScore,
    ownerEarningsQuality: PrimaryDimensionScore,
    capitalAllocation: PrimaryDimensionScore,
    debtSustainability: PrimaryDimensionScore,
    insiderAlignment: PrimaryDimensionScore,
    cyclicalityAwareness: PrimaryDimensionScore,
  }),
});
export type PrimarySourceChecklist = z.infer<typeof PrimarySourceChecklist>;

export const PRIMARY_DIMENSION_KEYS = [
  'moatDurability',
  'ownerEarningsQuality',
  'capitalAllocation',
  'debtSustainability',
  'insiderAlignment',
  'cyclicalityAwareness',
] as const;
export type PrimaryDimensionKey = (typeof PRIMARY_DIMENSION_KEYS)[number];

export function isInsufficientPrimary(
  d: PrimaryDimensionScore,
): d is { score: 'insufficient'; reason: string } {
  return d.score === 'insufficient';
}

// ---- Pass 2: skeptic rebuttals ----

export const SkepticRebuttal = z.object({
  rebuttal: z.string(),
  citations: z.array(PrimarySourceCitation),
  recommendedAdjustment: z.number().min(-3).max(1.5),
});
export type SkepticRebuttal = z.infer<typeof SkepticRebuttal>;

export const PrimarySourceSkeptic = z.object({
  ticker: z.string(),
  filingAccession: z.string(),
  rebuttals: z.object({
    moatDurability: SkepticRebuttal,
    ownerEarningsQuality: SkepticRebuttal,
    capitalAllocation: SkepticRebuttal,
    debtSustainability: SkepticRebuttal,
    insiderAlignment: SkepticRebuttal,
    cyclicalityAwareness: SkepticRebuttal,
  }),
});
export type PrimarySourceSkeptic = z.infer<typeof PrimarySourceSkeptic>;

// ---- Pass 3: judge reconciliation ----

export const JudgedDimension = z.object({
  finalScore: z.number().min(1).max(10),
  // The judge's call. "agreed-with-pass1" / "agreed-with-pass2" / "split"
  // are the three outcomes for a scoring decision; "no-change" means the
  // skeptic recommended 0 and the judge confirmed.
  decision: z.enum(['agreed-with-pass1', 'agreed-with-pass2', 'split', 'no-change']),
  justification: z.string(),
});
export type JudgedDimension = z.infer<typeof JudgedDimension>;

export const PrimarySourceJudgment = z.object({
  ticker: z.string(),
  filingAccession: z.string(),
  finalScores: z.object({
    moatDurability: JudgedDimension,
    ownerEarningsQuality: JudgedDimension,
    capitalAllocation: JudgedDimension,
    debtSustainability: JudgedDimension,
    insiderAlignment: JudgedDimension,
    cyclicalityAwareness: JudgedDimension,
  }),
});
export type PrimarySourceJudgment = z.infer<typeof PrimarySourceJudgment>;

// ---- Meta-card (per-ticker synthesis, Weekend 4) ----
//
// The meta-card is the top-level user-facing artifact for the ticker-first
// workflow. It aggregates: (a) primary-source value-checklist final scores
// from Pass 3 (median + variance), (b) reverse-DCF summary, (c) historical
// valuation context, and (d) optional analyst-video DecisionCards. The
// output is one verdict + one weighted score, with consensus/divergence
// sections explaining where sources agree or disagree.

export const MetaCardVerdict = z.enum(['Strong Candidate', 'Watchlist', 'Pass', 'Insufficient Data']);
export type MetaCardVerdict = z.infer<typeof MetaCardVerdict>;

// Per-dimension entry in the meta-card. Carries the median, range, and
// uncertainty flag so the user can see at a glance where the system is
// confident vs not.
export const MetaCardDimension = z.object({
  finalScore: z.number().min(1).max(10),
  range: z.number().min(0).optional(),
  uncertainty: z.enum(['tight', 'moderate', 'high']),
  // The dimension's effective weight in the composite score. Tight/moderate
  // dimensions get full weight (1.0); high-uncertainty dimensions get 0.7.
  effectiveWeight: z.number(),
  rationale: z.string(),
});
export type MetaCardDimension = z.infer<typeof MetaCardDimension>;

// One row in the consensus/divergence cross-source table. Surfaces points
// where analyst content and primary-source analysis agree or disagree.
// Empty array when no analyst content is configured for the ticker.
export const CrossSourceFinding = z.object({
  topic: z.string(),
  analystView: z.string(),
  primarySourceView: z.string(),
  agreement: z.enum(['agree', 'partial', 'disagree']),
});
export type CrossSourceFinding = z.infer<typeof CrossSourceFinding>;

// ---- 10-Q delta (change detection vs the annual baseline) ----
//
// ADDITIVE, NON-SCORING. The six dimension scores, the meta-card verdict, and
// the reverse DCF are anchored on the 10-K + DEF 14A and are NOT affected by
// anything here. This section detects material QUALITATIVE change in the
// already-fetched 10-Q (MD&A + risk factors) against the corresponding 10-K
// sections — the one thing value frameworks actually use a thin, unaudited
// quarterly for: "what changed since the annual baseline?"
//
// Source separation is load-bearing: each change carries TWO citations, one to
// the 10-Q passage and one to the 10-K passage it diverges from, each attributed
// to its own filing. The two are never merged into a single claim. That is why
// this avoids the citation-consistency hazard that blocked folding the 10-Q into
// scoring.
export const TenqChangeDirection = z.enum(['improving', 'deteriorating', 'neutral-but-notable']);
export type TenqChangeDirection = z.infer<typeof TenqChangeDirection>;

// One side of a dual citation, attributed to a single filing. `form` records
// which filing this passage came from so the UI/markdown can label it and so the
// citation verifier resolves it against the right accession.
export const TenqCitation = z.object({
  form: z.enum(['10-Q', '10-K']),
  section: z.string(),   // 'mda' | 'risk-factors' (the section id within that filing)
  quote: z.string(),     // verbatim passage from THIS filing only — never merged
});
export type TenqCitation = z.infer<typeof TenqCitation>;

export const TenqChange = z.object({
  // What changed, in plain English. Describes the divergence; does not merge the
  // two sources' wording into one sentence as if both said it.
  change: z.string(),
  // Which thesis-relevant area this touches (e.g. "margins", "demand",
  // "competition", "regulatory/export controls", "liquidity"). Free text — this
  // is NOT one of the six scored dimensions and must not be conflated with them.
  area: z.string(),
  direction: TenqChangeDirection,
  // Dual citation: the 10-Q passage and the 10-K passage it diverges from. Each
  // stays attributed to its own filing.
  tenqCitation: TenqCitation,   // form must be '10-Q'
  tenkCitation: TenqCitation,   // form must be '10-K'
});
export type TenqChange = z.infer<typeof TenqChange>;

export const TenqDelta = z.object({
  // Provenance so the comparison's basis is visible on the card.
  tenqAccession: z.string(),
  tenqFilingDate: z.string(),
  tenkAccession: z.string(),
  tenkFilingDate: z.string(),
  // 2-4 sentence plain-English overview of how the quarter's narrative differs
  // from the annual baseline. Empty-ish when nothing material changed.
  summary: z.string(),
  changes: z.array(TenqChange),
  // Scoped headline that states what was ACTUALLY assessed — e.g.
  // "10 changes" when full coverage, or "10 risk-factor changes; MD&A not
  // assessed" when a depended-on section failed extraction. The card shows this
  // verbatim so a reader scanning only the count sees the honest scope without
  // reading a footnote. Computed from section confidence, never the model.
  //
  // BACKWARD COMPAT: cards persisted by the first 10-Q-delta release (316ab88)
  // predate this field. Rather than 500 on those rows, fall back to a plain
  // count derived from `changes` — the same full-coverage wording the producer
  // emits when no section failed extraction.
  headline: z.string().optional(),
  // Data-quality stamp: one entry per depended-on section (MD&A, risk factors)
  // that failed extraction or was missing, so the limitation is visible on the
  // card rather than hidden behind a confident change count. Empty when both
  // compared sections parsed cleanly. Same spirit as the SEC dataQuality note
  // and the transcript-normalization stamp. NOTE: this flags an extraction
  // failure; it does not fix the parser.
  //
  // BACKWARD COMPAT: defaults to [] for pre-9dd2052 rows — an empty stamp reads
  // as "no known coverage gaps", which is the honest reading for a card that
  // never computed the stamp.
  coverageWarnings: z.array(z.string()).default([]),
}).transform((d) => ({
  ...d,
  headline: d.headline ?? `${d.changes.length} change${d.changes.length === 1 ? '' : 's'}`,
}));
export type TenqDelta = z.infer<typeof TenqDelta>;

export const MetaCard = z.object({
  ticker: z.string(),
  generatedAt: z.string(),
  verdict: MetaCardVerdict,
  weightedScore: z.number().min(1).max(10),
  // Headline summary — 2-4 sentences distilling the verdict for the user.
  // Generated by the meta-card prompt; should explain the score in plain
  // English without restating the dimension table.
  summary: z.string(),
  // Six dimensions, mirroring the primary-source checklist.
  dimensions: z.object({
    moatDurability: MetaCardDimension,
    ownerEarningsQuality: MetaCardDimension,
    capitalAllocation: MetaCardDimension,
    debtSustainability: MetaCardDimension,
    insiderAlignment: MetaCardDimension,
    cyclicalityAwareness: MetaCardDimension,
  }),
  // Source-input summary so the user knows what fed the verdict.
  inputs: z.object({
    primarySourceFiling: z.string(),       // 10-K accession used
    proxyFiling: z.string().nullable(),    // DEF 14A accession or null
    analystVideoCount: z.number().int(),   // 0 when no videos configured
    reverseDcfCentralImpliedCagr: z.number().nullable(),
    actualFcf5yCagr: z.number().nullable(),
  }),
  // Total LLM spend across all stages (analyst-video pipeline, primary-source
  // 3 passes including triple-sampling, meta-card synthesis). USD. Optional
  // for backward compatibility with cards generated before this field was
  // added; absent values render as "n/a" in the markdown.
  totalLlmCost: z.number().min(0).optional(),
  // Consensus and divergence between analyst views and primary-source
  // analysis. Empty when no analyst content. Otherwise: surface the most
  // material agreements and disagreements with explicit explanation.
  crossSourceFindings: z.array(CrossSourceFinding),
  // 3-7 specific things the user should verify themselves before acting.
  // Always populated regardless of analyst content.
  thingsToVerify: z.array(z.string()),
  // Plain-English explanation of what disagreements between sources tell
  // the user. Surfaces the meta-card's "where to focus your own judgment"
  // signal. Optional — empty string when there are no notable disagreements.
  divergenceCommentary: z.string(),
  // ADDITIVE: change detection of the latest 10-Q vs the 10-K baseline. Does
  // NOT influence verdict, weightedScore, dimensions, or the reverse DCF — it
  // is attached after synthesis. Absent when no 10-Q was available or the pass
  // was skipped (backward-compatible with cards generated before this field).
  tenqDelta: TenqDelta.optional(),
});
export type MetaCard = z.infer<typeof MetaCard>;

// ---- Reverse DCF (teaching module) ----
//
// Given current price and FCF, solve for the FCF growth rate the market is
// implicitly pricing in across a grid of (discount rate, terminal multiple)
// assumptions. Output is a sensitivity table the user reads to understand
// "what does the current price assume about the future?" — not a valuation
// the tool issues, but the inverse question.

export const ReverseDcfCell = z.object({
  discountRate: z.number(),       // e.g. 0.08, 0.10, 0.12
  terminalMultiple: z.number(),   // e.g. 15, 20, 25 (P/FCF on year-10 FCF)
  // The 10-year FCF CAGR at which DCF(...) = currentPrice * sharesOutstanding.
  // Null when no plausible CAGR makes the math work (e.g. extremely high
  // discount + low terminal at a price far above any reasonable FCF
  // assumption — the implied growth would be unbounded).
  impliedFcfCagr: z.number().nullable(),
});
export type ReverseDcfCell = z.infer<typeof ReverseDcfCell>;

export const ReverseDcfReport = z.object({
  ticker: z.string(),
  asOf: z.string(),
  currentPrice: z.number(),
  sharesOutstanding: z.number(),  // diluted, in millions
  startingFcfMillions: z.number(),
  // 3-year and 5-year actual FCF CAGR for context — the user compares these
  // to the implied CAGRs in the grid to gauge plausibility.
  actualFcfCagr3y: z.number().nullable(),
  actualFcfCagr5y: z.number().nullable(),
  grid: z.array(ReverseDcfCell),
  // Plain-English narrative explaining what the grid says. Generated by the
  // reverse-DCF module deterministically (no LLM call), so it remains stable
  // and inspectable.
  narrative: z.string(),
});
export type ReverseDcfReport = z.infer<typeof ReverseDcfReport>;

export function isInsufficient(
  d: ScoredDimension,
): d is { value: 'insufficient'; reason: string } {
  return d.value === 'insufficient';
}

export function computeWeightedScore(
  scores: ScoredAnalysis['scores'],
  weights: ScoreWeights = DEFAULT_WEIGHTS,
): number {
  let total = 0;
  for (const key of [
    'marginOfSafety',
    'valuationAttractiveness',
    'businessQuality',
    'financialHealth',
    'analystRigor',
  ] as const) {
    const dim = scores[key];
    if (isInsufficient(dim)) continue;
    total += weights[key] * dim.value;
  }
  return Math.round(total * 10) / 10;
}

export function computeVerdict(scores: ScoredAnalysis['scores']): Verdict {
  const anyInsufficient = (Object.values(scores) as ScoredDimension[]).some(isInsufficient);
  if (anyInsufficient) return 'Insufficient Data';
  const weighted = computeWeightedScore(scores);
  if (weighted >= 8.0) return 'Strong Candidate';
  if (weighted >= 6.0) return 'Watchlist';
  return 'Pass';
}

// =========================================================================
// Signal Tracker (packages/signals) — Phase 1 schemas.
//
// A sibling tool that watches a small set of theses and flags when new
// evidence (SEC filings, FMP consensus estimates, FMP analyst-ratings drift,
// or a hand-entered note) moves one. Phase 1 is schema + ingestion + diff,
// NO LLM. The `Signal` shape is defined now but only produced in Phase 2.
//
// Design constraint from the Phase 0 gate: we are on the FMP Starter tier, so
// consensus is ANNUAL-ONLY and the "estimate revision" feed is a monthly
// analyst-RATINGS-distribution bull-index proxy, NOT true per-analyst estimate
// changes. Every Signal therefore carries a `dataQuality` field naming its
// source and known degradation, so Phase 2's eval can attribute a weak
// classification to thin data vs. a weak prompt.
// =========================================================================

// ---- Event sources -------------------------------------------------------
//
// Where an Event came from. Drives both ingestion (which adapter produced it)
// and the dataQuality string a downstream Signal inherits.
//   - sec-8k / sec-10q / sec-10k : company-reported filings (EDGAR). The
//     primary-source half — guidance (8-K Ex-99.1), MD&A + capex (10-Q/10-K).
//   - fmp-estimates  : annual consensus estimate snapshot (FMP Starter).
//   - fmp-revisions  : monthly analyst-ratings bull-index snapshot (FMP proxy).
//   - manual         : hand-entered event for a watch-item with no feed on our
//     tier (e.g. TSMC capex — foreign filer, not on EDGAR/Starter).
export const EventSource = z.enum([
  'sec-8k',
  'sec-10q',
  'sec-10k',
  'fmp-estimates',
  'fmp-revisions',
  'av-transcript',
  'manual',
]);
export type EventSource = z.infer<typeof EventSource>;

// A normalized unit of new information, source-agnostic. Phase 1 ingests these
// and diffs them against a cursor; Phase 2 classifies (Event × Thesis) → Signal.
export const Event = z.object({
  // Stable, content-derived identity used for dedup across runs. Construction
  // is per-source (see feeds.ts): SEC = accession no.; estimates = hash of the
  // estimate snapshot; revisions = `${ticker}:${snapshotDate}`; manual = a
  // caller-supplied id. Two ingests of the same underlying fact MUST produce
  // the same dedupKey.
  dedupKey: z.string(),
  source: EventSource,
  ticker: z.string(),
  // The date the event is "as of" (filing date, estimate fiscal date, ratings
  // snapshot month, or the manual note's date). YYYY-MM-DD.
  date: z.string(),
  // One-line human summary for the track.ts printout (no LLM — built
  // mechanically from the source fields).
  title: z.string(),
  // A link a human can follow to verify (EDGAR doc URL, FMP endpoint, or a
  // user-supplied reference for manual events). Null when none applies.
  url: z.string().nullable(),
  // The raw normalized payload from the adapter, kept verbatim so Phase 2 has
  // the structured numbers without a re-fetch. Shape varies by source; the
  // adapters own the contract, so this is intentionally loose here.
  payload: z.record(z.string(), z.unknown()),
  // Source + known degradation, e.g.
  //   "consensus=annual-only (FMP Starter)"
  //   "revision=ratings-bull-index-proxy; not true estimate revisions"
  //   "manual entry; not independently verified"
  // A Signal derived from this Event inherits/extends this string.
  dataQuality: z.string(),
});
export type Event = z.infer<typeof Event>;

// ---- Watch-items + theses ------------------------------------------------

// How a watch-item is fed. `auto` items are populated by a feed adapter;
// `manual` items require a hand-entered Event (the TSMC-capex case).
export const WatchItemFeed = z.enum(['auto', 'manual']);
export type WatchItemFeed = z.infer<typeof WatchItemFeed>;

// A single thing we watch for a thesis, with the tripwire that, when crossed,
// flips the thesis status. The threshold is intentionally a free-form string +
// a typed direction in Phase 1 (the numeric/zod-validated comparison logic
// lands with the evaluator in Phase 2/3); here it documents intent and seeds
// the diff/printout.
export const WatchItem = z.object({
  id: z.string(),
  label: z.string(),
  // Which Event sources can satisfy this watch-item. e.g. a guidance item
  // watches ['sec-8k']; a "consensus catching up" item watches
  // ['fmp-estimates','fmp-revisions']; TSMC capex watches ['manual'].
  sources: z.array(EventSource).min(1),
  feed: WatchItemFeed,
  // Plain-English tripwire, e.g. "gross margin guide below 70%" or
  // "consensus FY revenue revised up >15% (thesis getting priced in)".
  tripwire: z.string(),
  // Whether crossing the tripwire strengthens or weakens the thesis. `either`
  // when direction depends on the reading (decided by the Phase 2 judge).
  tripwireDirection: z.enum(['strengthens', 'weakens', 'either']),
});
export type WatchItem = z.infer<typeof WatchItem>;

export const Thesis = z.object({
  id: z.string(),
  // The plain-English claim the tracker is arguing with.
  claim: z.string(),
  // Tickers whose filings/estimates feed this thesis (uppercase).
  tickers: z.array(z.string()).min(1),
  // Non-ticker entities the thesis depends on (e.g. "TSMC", "hyperscaler capex")
  // — watched via manual events on our tier.
  entities: z.array(z.string()),
  watchItems: z.array(WatchItem).min(1),
});
export type Thesis = z.infer<typeof Thesis>;

export const ThesesFile = z.object({
  // Mirrors data/tickers.json's leading-underscore doc convention.
  _doc: z.string().optional(),
  theses: z.array(Thesis),
});
export type ThesesFile = z.infer<typeof ThesesFile>;

// ---- Signal (defined now, produced in Phase 2) ---------------------------

export const SignalDirection = z.enum(['strengthens', 'weakens', 'neutral']);
export type SignalDirection = z.infer<typeof SignalDirection>;

// The Phase 2 classifier's output for one (Event × Thesis × WatchItem). Phase 1
// does NOT emit these — the shape is fixed here so feeds/diff and the eval
// harness agree on it ahead of time.
export const Signal = z.object({
  thesisId: z.string(),
  watchItemId: z.string(),
  // The Event that triggered this classification (by dedupKey).
  eventDedupKey: z.string(),
  direction: SignalDirection,
  // 0–1: how much this moves the thesis probability. Phase 2 fills this in.
  magnitude: z.number().min(0).max(1),
  confidence: Confidence,
  rationale: z.string(),
  // Verbatim citation back to the source (filing line / estimate figure).
  citation: z.string(),
  // Inherited from the triggering Event and possibly extended by the evaluator.
  // REQUIRED so a weak classification can be attributed to thin data.
  dataQuality: z.string(),
});
export type Signal = z.infer<typeof Signal>;

// ---- Eval log ------------------------------------------------------------
//
// One row per (event × watch-item) pair the engine ACTUALLY evaluated (reached
// extract→critique→judge). Records what was looked at and what the engine
// concluded — including no_candidate and neutral, the dismissed cases that
// never become signals and are otherwise invisible. Pairs filtered out by
// watch-item mapping before any LLM call are NOT logged here.

export const EvaluationOutcomeKind = z.enum(['no_candidate', 'neutral', 'signal']);
export type EvaluationOutcomeKind = z.infer<typeof EvaluationOutcomeKind>;

export const EvaluationRecord = z.object({
  thesisId: z.string(),
  watchItemId: z.string(),
  // Stable event identity — SEC accession / `av:<ticker>:<quarter>` / FMP
  // snapshot hash. Same key the signals table uses, so a `signal` outcome links
  // 1:1 to its signal by (thesisId, watchItemId, eventDedupKey).
  eventDedupKey: z.string(),
  ticker: z.string(),
  source: EventSource,
  eventDate: z.string(), // YYYY-MM-DD
  outcome: EvaluationOutcomeKind,
  hasSignal: z.boolean(),
  evaluatedAt: z.string(),
});
export type EvaluationRecord = z.infer<typeof EvaluationRecord>;

// ---- Phase 2 evaluator: per-step LLM I/O schemas -------------------------
//
// The evaluator (packages/signals/src/evaluate.ts) runs extract → critique →
// judge per (Event × WatchItem). Each step's LLM output is validated against
// the matching schema below; the judge's output becomes a `Signal`.

// Stage 1 (extract). `candidate: null` is the common "no signal here" answer.
export const SignalCandidate = z.object({
  fact: z.string(),
  citation: z.string(),
  sourceLocation: z.string(),
  relevance: z.string(),
});
export type SignalCandidate = z.infer<typeof SignalCandidate>;

export const SignalExtractResult = z.object({
  candidate: SignalCandidate.nullable(),
  // Present on the null path; optional on the hit path.
  reason: z.string().optional(),
  candidate_present: z.boolean().optional(),
});
export type SignalExtractResult = z.infer<typeof SignalExtractResult>;

// Stage 2 (critique). The adversarial verdicts that bind the judge.
export const PricedInVerdict = z.enum([
  'already-priced-in',
  'partially-priced-in',
  'not-priced-in',
]);
export type PricedInVerdict = z.infer<typeof PricedInVerdict>;

export const SignalCritique = z.object({
  pricedIn: z.object({
    verdict: PricedInVerdict,
    reasoning: z.string(),
  }),
  noiseDressedAsSignal: z.object({
    verdict: z.enum(['noise', 'marginal', 'substantive']),
    reasoning: z.string(),
  }),
  contraryReading: z.string(),
  survives: z.boolean(),
});
export type SignalCritique = z.infer<typeof SignalCritique>;

// Stage 3 (judge). The raw LLM output, before we attach thesis/watch-item/event
// ids and dataQuality to form the full `Signal`. direction+magnitude+confidence
// are the noisy, triple-sampled fields.
export const SignalJudgment = z.object({
  direction: SignalDirection,
  magnitude: z.number().min(0).max(1),
  confidence: Confidence,
  rationale: z.string(),
  citation: z.string(),
});
export type SignalJudgment = z.infer<typeof SignalJudgment>;

// ---- Thesis status -------------------------------------------------------

// green = confirmed / on-track; amber = watch (something moved, not decisive);
// red = tripped (a tripwire crossed against the thesis).
export const ThesisHealth = z.enum(['green', 'amber', 'red']);
export type ThesisHealth = z.infer<typeof ThesisHealth>;

export const WatchItemState = z.object({
  watchItemId: z.string(),
  health: ThesisHealth,
  // dedupKeys of the events that last moved this watch-item.
  lastEventKeys: z.array(z.string()),
  note: z.string(),
});
export type WatchItemState = z.infer<typeof WatchItemState>;

export const ThesisStatus = z.object({
  thesisId: z.string(),
  health: ThesisHealth,
  updatedAt: z.string(),
  watchItems: z.array(WatchItemState),
  // Tripwires crossed on the most recent update (empty when none flipped).
  trippedWatchItemIds: z.array(z.string()),
});
export type ThesisStatus = z.infer<typeof ThesisStatus>;
