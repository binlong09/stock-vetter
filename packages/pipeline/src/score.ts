import {
  ScoredAnalysis,
  computeVerdict,
  computeWeightedScore,
  type Critiques,
  type ExtractedAnalysis,
  type FinancialSnapshot,
} from '@stock-vetter/schema';
import { llmCallJson, type CostTracker } from './llm.js';
import { loadPrompt } from './prompts.js';

export async function scoreAnalysis(opts: {
  extraction: ExtractedAnalysis;
  snapshot: FinancialSnapshot | null;
  critiques: Critiques;
  tracker: CostTracker;
}): Promise<ScoredAnalysis> {
  const system = await loadPrompt('score');
  const userMessage = [
    `EXTRACTED_ANALYSIS:\n${JSON.stringify(opts.extraction, null, 2)}`,
    '',
    `FINANCIAL_SNAPSHOT:\n${JSON.stringify(opts.snapshot, null, 2)}`,
    '',
    `CRITIQUES:\n${JSON.stringify(opts.critiques, null, 2)}`,
  ].join('\n');

  const scored = await llmCallJson({
    stage: 'score',
    systemPrompt: system,
    userMessage,
    schema: ScoredAnalysis,
    maxTokens: 4096,
    tracker: opts.tracker,
  });

  // Recompute weightedScore + verdict from authoritative helpers regardless of
  // what the LLM emitted. This keeps the pattern-match on the union explicit
  // and prevents the LLM from drifting on the math or verdict thresholds.
  const weightedScore = computeWeightedScore(scored.scores);
  const verdict = computeVerdict(scored.scores);
  return { ...scored, weightedScore, verdict, realityCheck: null };
}
