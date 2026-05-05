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
      revenue: z.number().optional(),
      ebit: z.number().optional(),
      growthRate: z.number().optional(),
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
    impliedReturn: z.object({ low: z.number(), high: z.number() }).optional(),
    impliedPriceTarget: z.number().optional(),
  }),
  qualitativeFactors: z.object({
    managementQuality: z.string(),
    moat: z.string(),
    insiderOwnership: z.string().nullable(),
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
