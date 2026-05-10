// Meta-card synthesis: aggregates primary-source checklist + reverse DCF +
// historical valuation context + (optional) analyst-video DecisionCards
// into one ticker-level verdict.
//
// Architecture:
// 1. Compute the weighted score deterministically from Pass 3 final scores,
//    applying variance-based weight reduction (high-uncertainty dimensions
//    weighted at 0.7x).
// 2. Call the meta-card prompt to produce summary + cross-source findings +
//    things-to-verify + divergence commentary. The LLM does synthesis, not
//    re-scoring — the dimensions and weighted score are already computed
//    by the time we call.
// 3. Assemble into MetaCard with verdict applied per-rule.

import { z } from 'zod';
import {
  isInsufficientPrimary,
  MetaCard,
  type DecisionCard,
  type FinancialSnapshot,
  type MetaCardDimension,
  type MetaCardVerdict,
  type PrimarySourceChecklist,
  type PrimarySourceJudgment,
  type ReverseDcfReport,
  PRIMARY_DIMENSION_KEYS,
  type PrimaryDimensionKey,
  type CrossSourceFinding,
} from '@stock-vetter/schema';
import { llmCallJson, newCostTracker, type CostTracker } from './llm.js';
import { loadPrompt } from './prompts.js';
import { getLlmOutput, putLlmOutput, hashInputs } from './cache.js';

// Per-dimension weights. Mirrors the analyst-pipeline weights on similar
// dimensions and reflects value-investing emphasis: business quality and
// margin-of-safety-adjacent dimensions matter most.
//
// Note these add to 1.0 in the *equal-weight* case. The final composite
// applies variance-based weight reduction (0.7x for high-uncertainty
// dimensions), and re-normalizes so weights still sum to 1.
const BASE_WEIGHTS: Record<PrimaryDimensionKey, number> = {
  moatDurability: 0.20,
  ownerEarningsQuality: 0.20,
  capitalAllocation: 0.20,
  debtSustainability: 0.15,
  insiderAlignment: 0.10,
  cyclicalityAwareness: 0.15,
};

// Variance bucketing for the meta-card. Matches the per-dimension annotation
// thresholds the primary-source-render uses.
function classifyUncertainty(range: number | undefined): 'tight' | 'moderate' | 'high' {
  if (range == null) return 'moderate'; // legacy single-sample data
  if (range <= 0.5) return 'tight';
  if (range <= 1.5) return 'moderate';
  return 'high';
}

function effectiveWeightFor(uncertainty: 'tight' | 'moderate' | 'high', base: number): number {
  // High-uncertainty dimensions are penalized 30%. Tight and moderate get
  // full weight — moderate variance is normal LLM behavior, not a flag.
  return uncertainty === 'high' ? base * 0.7 : base;
}

// Compose dimensions from Pass 3 final scores + Pass 1 variance data.
function composeDimensions(
  pass3: PrimarySourceJudgment,
  pass1: PrimarySourceChecklist,
): { dimensions: Record<PrimaryDimensionKey, MetaCardDimension>; weightedScore: number; insufficient: boolean } {
  const dimensions = {} as Record<PrimaryDimensionKey, MetaCardDimension>;
  let weightedSum = 0;
  let weightTotal = 0;
  let insufficient = false;
  for (const key of PRIMARY_DIMENSION_KEYS) {
    const j = pass3.finalScores[key];
    const p1 = pass1.scores[key];
    if (isInsufficientPrimary(p1)) {
      insufficient = true;
      // Synthetic placeholder: score 5.5 (neutral midpoint), zero weight.
      dimensions[key] = {
        finalScore: 5.5,
        uncertainty: 'high',
        effectiveWeight: 0,
        rationale: `Primary-source dimension marked insufficient: ${p1.reason}`,
      };
      continue;
    }
    const range = p1.range ?? 0;
    const uncertainty = classifyUncertainty(p1.range);
    const base = BASE_WEIGHTS[key];
    const eff = effectiveWeightFor(uncertainty, base);
    dimensions[key] = {
      finalScore: j.finalScore,
      range: p1.range,
      uncertainty,
      effectiveWeight: eff,
      rationale: j.justification,
    };
    weightedSum += j.finalScore * eff;
    weightTotal += eff;
  }
  // Re-normalize so the weighted score stays on a 1-10 scale even after
  // variance-based weight reduction.
  const weightedScore = weightTotal > 0 ? weightedSum / weightTotal : 5.5;
  return { dimensions, weightedScore, insufficient };
}

// Deterministic verdict bucketing per the prompt's rules.
function applyVerdictRules(
  weightedScore: number,
  dimensions: Record<PrimaryDimensionKey, MetaCardDimension>,
  insufficient: boolean,
  reverseDcfStretched: boolean,
): MetaCardVerdict {
  if (insufficient) return 'Insufficient Data';
  // Single dimension below 4.0 with high confidence (tight or moderate, not high) is a hard pass.
  for (const key of PRIMARY_DIMENSION_KEYS) {
    const d = dimensions[key];
    if (d.finalScore < 4.0 && d.uncertainty !== 'high') return 'Pass';
  }
  if (weightedScore < 6.0) return 'Pass';
  // Strong Candidate gating: ≥ 8.0 weighted, no high-uncertainty dimension,
  // reverse DCF not implying egregiously high growth.
  const anyHigh = Object.values(dimensions).some((d) => d.uncertainty === 'high');
  if (weightedScore >= 8.0 && !anyHigh && !reverseDcfStretched) return 'Strong Candidate';
  return 'Watchlist';
}

// "Stretched" reverse DCF: implied 10y FCF CAGR is materially above the
// company's 5-year actual delivered CAGR. Threshold: implied is > 5
// percentage points above actual, OR actual is null and implied is > 12%.
// The point is to flag cases where the price embeds growth assumptions the
// historical track record doesn't support.
function isReverseDcfStretched(dcf: ReverseDcfReport | null): boolean {
  if (!dcf) return false;
  const central = dcf.grid.find(
    (c) => Math.abs(c.discountRate - 0.10) < 1e-6 && c.terminalMultiple === 20,
  );
  if (!central?.impliedFcfCagr) return false;
  const implied = central.impliedFcfCagr;
  const actual = dcf.actualFcfCagr5y ?? dcf.actualFcfCagr3y;
  if (actual == null) return implied > 0.12;
  return implied > actual + 0.05;
}

const SynthesisOutputSchema = z.object({
  ticker: z.string(),
  verdict: z.enum(['Strong Candidate', 'Watchlist', 'Pass', 'Insufficient Data']),
  summary: z.string(),
  crossSourceFindings: z.array(
    z.object({
      topic: z.string(),
      analystView: z.string(),
      primarySourceView: z.string(),
      agreement: z.enum(['agree', 'partial', 'disagree']),
    }),
  ),
  thingsToVerify: z.array(z.string()),
  divergenceCommentary: z.string(),
});

// Render the dimension table for the LLM prompt. Plain numbers, variance
// flags, no narrative — the model adds narrative.
function renderDimensionsForPrompt(
  dimensions: Record<PrimaryDimensionKey, MetaCardDimension>,
  pass1: PrimarySourceChecklist,
): string {
  const labels: Record<PrimaryDimensionKey, string> = {
    moatDurability: 'Moat durability',
    ownerEarningsQuality: 'Owner earnings quality',
    capitalAllocation: 'Capital allocation',
    debtSustainability: 'Debt sustainability',
    insiderAlignment: 'Insider alignment',
    cyclicalityAwareness: 'Cyclicality awareness',
  };
  const lines: string[] = [];
  lines.push('| Dimension | Final score | Range | Uncertainty | Weight | Rationale (Pass 3) |');
  lines.push('|---|---|---|---|---|---|');
  for (const key of PRIMARY_DIMENSION_KEYS) {
    const d = dimensions[key];
    const p1 = pass1.scores[key];
    const rationale = isInsufficientPrimary(p1) ? p1.reason : (p1.rationale.slice(0, 200) + '...');
    lines.push(
      `| ${labels[key]} | ${d.finalScore.toFixed(1)} | ${d.range != null ? d.range.toFixed(1) : 'n/a'} | ${d.uncertainty} | ${d.effectiveWeight.toFixed(2)} | ${rationale.replace(/\n/g, ' ').replace(/\|/g, '\\|')} |`,
    );
  }
  return lines.join('\n');
}

function renderReverseDcfForPrompt(dcf: ReverseDcfReport | null): string {
  if (!dcf) return '*Reverse DCF: not available (insufficient FCF or shares data).*';
  const central = dcf.grid.find(
    (c) => Math.abs(c.discountRate - 0.10) < 1e-6 && c.terminalMultiple === 20,
  );
  const implied = central?.impliedFcfCagr;
  const lines: string[] = [];
  lines.push(`Reverse DCF (10% discount, 20× terminal P/FCF): implied 10y FCF CAGR = ${implied != null ? `${(implied * 100).toFixed(1)}%` : 'n/a'}`);
  if (dcf.actualFcfCagr5y != null) lines.push(`Actual 5y FCF CAGR: ${(dcf.actualFcfCagr5y * 100).toFixed(1)}%`);
  if (dcf.actualFcfCagr3y != null) lines.push(`Actual 3y FCF CAGR: ${(dcf.actualFcfCagr3y * 100).toFixed(1)}%`);
  return lines.join('\n');
}

function renderHistoricalForPrompt(snapshot: FinancialSnapshot | null): string {
  if (!snapshot) return '*Historical context: not available.*';
  const lines: string[] = [];
  lines.push(`Current P/E: ${snapshot.peRatio?.toFixed(1) ?? 'n/a'}, 10y median: ${snapshot.peRatio10yMedian?.toFixed(1) ?? 'n/a'}`);
  lines.push(`Current EV/EBIT: ${snapshot.evEbit?.toFixed(1) ?? 'n/a'}, 10y median: ${snapshot.evEbit10yMedian?.toFixed(1) ?? 'n/a'}`);
  lines.push(`FCF yield: ${snapshot.fcfYield != null ? `${(snapshot.fcfYield * 100).toFixed(2)}%` : 'n/a'}`);
  return lines.join('\n');
}

function renderAnalystCardsForPrompt(cards: DecisionCard[]): string {
  if (cards.length === 0) {
    return '*No analyst content configured for this ticker. crossSourceFindings should be empty array; divergenceCommentary should be empty string.*';
  }
  const lines: string[] = [];
  lines.push(`${cards.length} analyst-video card(s) available:`);
  for (const c of cards) {
    lines.push('');
    lines.push(`### Analyst card (videoId=${c.videoId})`);
    lines.push(`Verdict: ${c.scored.verdict}, weighted score: ${c.scored.weightedScore.toFixed(1)}`);
    if (c.scored.prosConsTable.length) {
      lines.push('Top pros/cons:');
      for (const row of c.scored.prosConsTable.slice(0, 6)) {
        lines.push(`- [${row.agreement}] ${row.topic}: analyst="${row.analystView.slice(0, 200)}" llm="${row.llmPushback.slice(0, 200)}"`);
      }
    }
  }
  return lines.join('\n');
}

export type MetaCardOptions = {
  tracker?: CostTracker;
  onProgress?: (stage: string, costSoFar: number) => void;
};

export async function buildMetaCard(args: {
  ticker: string;
  pass1: PrimarySourceChecklist;
  pass3: PrimarySourceJudgment;
  reverseDcf: ReverseDcfReport | null;
  snapshot: FinancialSnapshot | null;
  proxyAccession?: string | null;
  analystCards?: DecisionCard[];
  options?: MetaCardOptions;
}): Promise<MetaCard> {
  const { ticker, pass1, pass3, reverseDcf, snapshot, proxyAccession, analystCards = [] } = args;
  const options = args.options ?? {};
  const tracker = options.tracker ?? newCostTracker(options.onProgress
    ? (t) => options.onProgress!('meta-card', t)
    : undefined);
  options.onProgress?.('meta-card:compose', tracker.total);

  const { dimensions, weightedScore, insufficient } = composeDimensions(pass3, pass1);
  const stretched = isReverseDcfStretched(reverseDcf);
  const verdict = applyVerdictRules(weightedScore, dimensions, insufficient, stretched);

  // Synthesis call: get summary + crossSourceFindings + thingsToVerify +
  // divergenceCommentary from the LLM.
  const promptText = await loadPrompt('meta-card');
  const dimTable = renderDimensionsForPrompt(dimensions, pass1);
  const dcfBlock = renderReverseDcfForPrompt(reverseDcf);
  const histBlock = renderHistoricalForPrompt(snapshot);
  const analystBlock = renderAnalystCardsForPrompt(analystCards);

  const inputHash = hashInputs({
    ticker: ticker.toUpperCase(),
    accession: pass1.filingAccession,
    weightedScore: weightedScore.toFixed(2),
    verdict,
    dimensionScores: PRIMARY_DIMENSION_KEYS.map((k) => dimensions[k].finalScore.toFixed(1)),
    dimensionUncertainty: PRIMARY_DIMENSION_KEYS.map((k) => dimensions[k].uncertainty),
    analystVideoIds: analystCards.map((c) => c.videoId).sort(),
    dcfImplied: reverseDcf?.grid.find((c) => Math.abs(c.discountRate - 0.10) < 1e-6 && c.terminalMultiple === 20)?.impliedFcfCagr ?? null,
    snapshotDate: snapshot?.asOf ?? null,
  });
  const cached = await getLlmOutput<z.infer<typeof SynthesisOutputSchema>>('meta-card', inputHash, promptText);
  let synthesis: z.infer<typeof SynthesisOutputSchema>;
  if (cached) {
    synthesis = cached;
  } else {
    const userMessage =
      `Synthesize the meta-card for ticker **${ticker.toUpperCase()}**.\n\n` +
      `--- Pre-computed weighted score ---\n` +
      `Weighted score: ${weightedScore.toFixed(2)} / 10\n` +
      `Suggested verdict (per bucket rules): ${verdict}\n` +
      `(The verdict is determined by code per the rubric in the system prompt; you must use this verdict in your output.)\n\n` +
      `--- Six dimensions (Pass 3 final scores with variance from Pass 1 triple-sampling) ---\n` +
      `${dimTable}\n\n` +
      `--- Reverse DCF ---\n` +
      `${dcfBlock}\n\n` +
      `--- Historical valuation context ---\n` +
      `${histBlock}\n\n` +
      `--- Analyst content ---\n` +
      `${analystBlock}\n\n` +
      `Return JSON in the schema specified in the system prompt. Output JSON only.`;
    synthesis = await llmCallJson({
      stage: 'meta-card',
      systemPrompt: promptText,
      userMessage,
      schema: SynthesisOutputSchema,
      maxTokens: 3072,
      tracker,
    });
    // Override the synthesis's verdict with our deterministic one — the
    // prompt instructs the model to use the suggested verdict, but defense
    // in depth: enforce it programmatically too.
    synthesis = { ...synthesis, verdict };
    await putLlmOutput('meta-card', inputHash, promptText, synthesis);
  }
  options.onProgress?.('meta-card:done', tracker.total);

  const central = reverseDcf?.grid.find(
    (c) => Math.abs(c.discountRate - 0.10) < 1e-6 && c.terminalMultiple === 20,
  );

  const card: MetaCard = {
    ticker: ticker.toUpperCase(),
    generatedAt: new Date().toISOString(),
    verdict,
    weightedScore,
    summary: synthesis.summary,
    dimensions,
    inputs: {
      primarySourceFiling: pass1.filingAccession,
      proxyFiling: proxyAccession ?? null,
      analystVideoCount: analystCards.length,
      reverseDcfCentralImpliedCagr: central?.impliedFcfCagr ?? null,
      actualFcf5yCagr: reverseDcf?.actualFcfCagr5y ?? null,
    },
    crossSourceFindings: synthesis.crossSourceFindings as CrossSourceFinding[],
    thingsToVerify: synthesis.thingsToVerify,
    divergenceCommentary: synthesis.divergenceCommentary,
  };
  return MetaCard.parse(card);
}
