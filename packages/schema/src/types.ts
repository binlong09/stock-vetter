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
