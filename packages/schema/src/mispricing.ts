// Schemas for the local-GPU filing mispricing scanner.
//
// These are the contract between the three tiers: the local model fills
// `ChunkExtraction` per chunk, deterministic code aggregates those into a
// `FilingBrief`, and the cloud model reads the brief and emits a
// `MispricingAssessment`.
//
// Two design rules run through all of them:
//
//  1. EVERY claim carries a verbatim `quote`. Not a paraphrase, not a summary
//     — a span that can be found in the source text with a substring search.
//     This is what makes `verifyQuotes` possible: a deterministic pass that
//     drops any finding whose quote isn't actually in the chunk. A local 30B
//     model hallucinates figures at a rate that matters across 2,000
//     companies; making every claim mechanically checkable converts that from
//     a silent accuracy problem into a measured drop rate.
//
//  2. Fields are `.nullable()` rather than `.optional()`. Under
//     grammar-constrained decoding a nullable field forces the model to emit
//     an explicit `null`, which is a decision. An optional field lets it omit
//     the key, which is indistinguishable from forgetting.

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Local tier: per-chunk extraction
// ---------------------------------------------------------------------------

/**
 * Forensic-accounting taxonomy. A closed enum rather than free text because
 * the categories are what the aggregation and triage stages count, and free
 * text produces forty spellings of "receivables problem" across one filing.
 */
export const FlagCategory = z.enum([
  'receivables', // AR or DSO growing faster than revenue
  'inventory', // inventory or DIO outpacing COGS
  'margin',
  'cash-conversion', // CFO diverging from net income
  'revenue-recognition', // policy, timing, channel stuffing, bill-and-hold
  'cost-capitalization', // costs capitalized rather than expensed
  'reserves', // allowance/reserve movements flattering earnings
  'non-gaap', // add-backs that grow or become permanent
  'one-time-items', // "non-recurring" charges that recur
  'segment-reclassification', // reporting changes that break comparability
  'related-party',
  'customer-concentration',
  'supplier-concentration',
  'dilution', // share count growth, ATM programs, convertibles
  'leverage-covenant', // debt terms, covenant headroom, maturities
  'liquidity', // cash runway, revolver draw, factoring
  'goodwill',
  'litigation-regulatory',
  'going-concern',
  'internal-control', // material weakness, remediation
  'auditor', // change, disagreement, adverse ICFR opinion
  'management', // CFO/CAO/controller departures
  'guidance', // withdrawn, cut, or conspicuously absent
  'accounting-estimate-change', // useful lives, discount rates, assumptions
  'other',
]);
export type FlagCategory = z.infer<typeof FlagCategory>;

export const FlagSeverity = z.enum(['low', 'medium', 'high']);
export type FlagSeverity = z.infer<typeof FlagSeverity>;

export const ExtractedMetric = z.object({
  /** As the filing names it, e.g. "Net Sales", "Accounts receivable, net". */
  label: z.string(),
  /** Numeric value, already scaled by `unit`. Null when the filing gives a range or omits it. */
  value: z.number().nullable(),
  /** e.g. "USD millions", "percent", "days", "shares (millions)". */
  unit: z.string(),
  /** The period this value covers, as the filing labels it: "FY2025", "Q3 2025". */
  period: z.string(),
  /** Prior-period comparative, when the filing shows one on the same line. */
  priorValue: z.number().nullable(),
  priorPeriod: z.string().nullable(),
  /**
   * Verbatim span from the chunk containing this figure. Checked mechanically;
   * a metric whose quote can't be found is dropped.
   */
  quote: z.string(),
});
export type ExtractedMetric = z.infer<typeof ExtractedMetric>;

export const ExtractedFlag = z.object({
  category: FlagCategory,
  severity: FlagSeverity,
  /** One sentence, specific and falsifiable. */
  claim: z.string(),
  /** Verbatim span from the chunk that supports the claim. */
  quote: z.string(),
  /** Why this bears on the mispricing. One sentence. */
  whyItMatters: z.string(),
});
export type ExtractedFlag = z.infer<typeof ExtractedFlag>;

export const ManagementClaim = z.object({
  /** What management asserts, in their framing. */
  claim: z.string(),
  quote: z.string(),
  /**
   * Can this be checked against a number in this or another filing? These
   * become the cloud tier's verification targets.
   */
  checkable: z.boolean(),
});
export type ManagementClaim = z.infer<typeof ManagementClaim>;

export const ChunkExtraction = z.object({
  /**
   * Dense factual bullets. The compression step: narrative in, telegraphic
   * financial statements out.
   */
  summary: z.array(z.string()),
  metrics: z.array(ExtractedMetric),
  flags: z.array(ExtractedFlag),
  managementClaims: z.array(ManagementClaim),
  /**
   * True when the chunk is genuinely routine. An explicit "nothing here" is a
   * real answer and far better than inventing findings to look useful — most
   * chunks of most filings say nothing worth a second look.
   */
  nothingMaterial: z.boolean(),
});
export type ChunkExtraction = z.infer<typeof ChunkExtraction>;

/** A chunk extraction plus the provenance needed to cite and re-retrieve it. */
export const ChunkExtractionRecord = z.object({
  chunkId: z.string(),
  ticker: z.string(),
  accession: z.string(),
  sectionId: z.string(),
  chunkIndex: z.number(),
  extraction: ChunkExtraction,
  /** Findings dropped because their quote wasn't in the source chunk. */
  droppedForBadQuote: z.number(),
});
export type ChunkExtractionRecord = z.infer<typeof ChunkExtractionRecord>;

// ---------------------------------------------------------------------------
// Cross-filing tier: trends, composites, recurrence
//
// These are computed, not extracted. Every value traces to a number the filer
// tagged in XBRL or to text located in the indexed corpus — no model produced
// any of it. The brief marks them as such, because the cloud model should
// weight "DSO went from 61 to 78 days" (arithmetic) very differently from
// "the local model read a sentence saying DSO rose" (transcription).
// ---------------------------------------------------------------------------

export const TrendChangeUnit = z.enum(['percent', 'days', 'bps', 'ratio']);
export type TrendChangeUnit = z.infer<typeof TrendChangeUnit>;

export const TrendFinding = z.object({
  id: z.string(),
  metric: z.string(),
  category: FlagCategory,
  severity: FlagSeverity,
  claim: z.string(),
  direction: z.enum(['deteriorating', 'improving']),
  /** Consecutive year-over-year periods moving the wrong way. */
  consecutivePeriods: z.number(),
  latestPeriod: z.string(),
  latestValue: z.number(),
  yearAgoValue: z.number(),
  change: z.number(),
  changeUnit: TrendChangeUnit,
  /** The series behind the finding, oldest first — auditable end to end. */
  series: z.array(z.object({ period: z.string(), value: z.number() })),
  /** us-gaap tags that supplied the inputs. */
  sourceTags: z.array(z.string()),
  /** True when any period used was revised by a later filing. */
  usesRestatedData: z.boolean(),
});
export type TrendFinding = z.infer<typeof TrendFinding>;

export const IndexBreakdown = z.object({
  name: z.string(),
  value: z.number().nullable(),
  note: z.string(),
});
export type IndexBreakdown = z.infer<typeof IndexBreakdown>;

export const BeneishResult = z.object({
  period: z.string(),
  mScore: z.number().nullable(),
  threshold: z.literal(-1.78),
  flagged: z.boolean(),
  indices: z.array(IndexBreakdown),
  missing: z.array(z.string()),
  /** Which index is actually driving the score. */
  dominantIndex: z.string().nullable(),
});
export type BeneishResult = z.infer<typeof BeneishResult>;

export const AltmanResult = z.object({
  period: z.string(),
  zScore: z.number().nullable(),
  variant: z.literal('Z-double-prime'),
  distressThreshold: z.literal(1.1),
  safeThreshold: z.literal(2.6),
  zone: z.enum(['distress', 'grey', 'safe', 'unknown']),
  components: z.array(IndexBreakdown),
  missing: z.array(z.string()),
});
export type AltmanResult = z.infer<typeof AltmanResult>;

export const RecurrenceFinding = z.object({
  id: z.enum(['repeated-explanation', 'recurring-one-time-charge']),
  category: FlagCategory,
  severity: FlagSeverity,
  claim: z.string(),
  quote: z.string(),
  priorOccurrences: z.array(
    z.object({
      accession: z.string(),
      form: z.string(),
      filingDate: z.string(),
      excerpt: z.string(),
    }),
  ),
  distinctPriorFilings: z.number(),
});
export type RecurrenceFinding = z.infer<typeof RecurrenceFinding>;

// A single "radar" signal: one deterministic tell surfaced by the
// always-on watchlist sweep (no GPU, no model). Reacted to same-day for 8-Ks,
// within a few days for XBRL-derived trends (companyfacts lags the filing). The
// `key` dedups a signal to a single surfacing across daily runs.
export const RadarSignalKind = z.enum(['8k-item', 'trend', 'restatement', 'composite']);
export type RadarSignalKind = z.infer<typeof RadarSignalKind>;

export const RadarSignal = z.object({
  /** Stable dedup key — a signal with this key is surfaced once. */
  key: z.string(),
  ticker: z.string(),
  cik: z.string(),
  /** Accession of the filing that triggered detection. */
  accession: z.string(),
  form: z.string(),
  filingDate: z.string(),
  kind: RadarSignalKind,
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  /** One-line headline for the digest row. */
  headline: z.string(),
  /** Longer context — the claim, the series, the item note. */
  detail: z.string(),
});
export type RadarSignal = z.infer<typeof RadarSignal>;

export const CrossFilingAnalysis = z.object({
  trends: z.array(TrendFinding),
  recurrence: z.array(RecurrenceFinding),
  beneish: BeneishResult.nullable(),
  altman: AltmanResult.nullable(),
  /** Quarters of comparable XBRL data available. Few quarters, weak claims. */
  periodsAvailable: z.number(),
  latestPeriod: z.string().nullable(),
  warnings: z.array(z.string()),
});
export type CrossFilingAnalysis = z.infer<typeof CrossFilingAnalysis>;

// ---------------------------------------------------------------------------
// Aggregation tier: one brief per filing
// ---------------------------------------------------------------------------

export const BriefFlag = ExtractedFlag.extend({
  /** Chunk ids where this flag was raised — more chunks means broader support. */
  sourceChunkIds: z.array(z.string()),
  occurrences: z.number(),
});
export type BriefFlag = z.infer<typeof BriefFlag>;

export const FilingBrief = z.object({
  ticker: z.string(),
  cik: z.string(),
  accession: z.string(),
  form: z.string(),
  filingDate: z.string(),
  /** Deterministic 8-K item severity, when the filing is an 8-K. */
  eightKItems: z.array(z.object({ number: z.string(), label: z.string(), severity: z.string() })),
  summary: z.array(z.string()),
  metrics: z.array(ExtractedMetric.extend({ sourceChunkId: z.string() })),
  flags: z.array(BriefFlag),
  managementClaims: z.array(ManagementClaim.extend({ sourceChunkId: z.string() })),
  /** Counts by category — what the triage gate scores. */
  /**
   * Cross-filing analysis. Null when the company has no usable XBRL history —
   * a recent IPO, or a filer whose tagging we can't read. Null means "not
   * computed", never "nothing found".
   */
  crossFiling: CrossFilingAnalysis.nullable(),
  flagCounts: z.record(z.string(), z.number()),
  chunksProcessed: z.number(),
  chunksFailed: z.number(),
  quotesDropped: z.number(),
  estimatedTokens: z.number(),
  warnings: z.array(z.string()),
});
export type FilingBrief = z.infer<typeof FilingBrief>;

// ---------------------------------------------------------------------------
// Cloud tier: the synthesized assessment
// ---------------------------------------------------------------------------

export const MispricingVerdict = z.enum([
  'mispriced-long', // filing reveals the market is too bearish — a catalyzed long
  'mispriced-short', // filing reveals the market is too bullish — a catalyzed short
  'watchlist', // a material change is visible, but no catalyst or no edge yet
  'no-edge', // nothing here, or everything here is already in the price
  'insufficient-data', // the filing didn't parse well enough to judge
]);
export type MispricingVerdict = z.infer<typeof MispricingVerdict>;

export const VerifiedCitation = z.object({
  claim: z.string(),
  quote: z.string(),
  accession: z.string(),
  sectionId: z.string(),
  /** Did the local index confirm this quote exists in the filing? */
  verified: z.boolean(),
});
export type VerifiedCitation = z.infer<typeof VerifiedCitation>;

export const MispricingAssessment = z.object({
  verdict: MispricingVerdict,
  /** The thesis in one or two sentences, or why there isn't one. */
  thesis: z.string(),
  /** long | short | none. The trade direction the thesis implies. */
  direction: z.enum(['long', 'short', 'none']),
  /** 1-10. Only meaningful when the verdict is mispriced-long/short or watchlist. */
  conviction: z.number().min(1).max(10),
  /** Specific, dated things that would force the market to reprice. */
  catalysts: z.array(z.object({ event: z.string(), expectedWindow: z.string() })),
  /** Ranked evidence, each tied to a quote from the filing. */
  evidence: z.array(
    z.object({
      point: z.string(),
      category: FlagCategory,
      severity: FlagSeverity,
      citation: VerifiedCitation,
    }),
  ),
  /**
   * The strongest case AGAINST the thesis, in its best form — the bear case for
   * a long, the bull case for a short. An assessment that can't state the other
   * side hasn't done the work.
   */
  counterThesis: z.string(),
  /** What would falsify the thesis. Required — an unfalsifiable thesis is a hope. */
  whatWouldKillThis: z.array(z.string()),
  /** Risks specific to putting on THIS trade: borrow/squeeze on a short; liquidity, dilution, or M&A on a long. */
  executionRisks: z.array(z.string()),
  /** Claims the model could not verify against the filing text. */
  unverifiedClaims: z.array(z.string()),
});
export type MispricingAssessment = z.infer<typeof MispricingAssessment>;
