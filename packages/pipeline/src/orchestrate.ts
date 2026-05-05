import type { DecisionCard } from '@stock-vetter/schema';
import { CostCeilingError } from './errors.js';
import { newCostTracker } from './llm.js';
import { fetchVideoBundle } from './transcript.js';
import { fetchFinancialSnapshot, fetchPeerSnapshots } from './financials.js';
import { getPeers } from './comps.js';
import { normalizeTranscript } from './normalize.js';
import { extractAnalysis } from './extract.js';
import { runCritiques } from './critique.js';
import { scoreAnalysis } from './score.js';

export type PipelineStage =
  | 'transcript'
  | 'financials'
  | 'normalize'
  | 'extract'
  | 'critique'
  | 'score'
  | 'done';

export type PipelineOptions = {
  onProgress?: (stage: PipelineStage, costSoFar: number) => void;
  onCostWarning?: (costSoFar: number) => void;
  onCostAbort?: (costSoFar: number) => void;
  debug?: boolean;
};

const COST_WARN = 0.75;
const COST_ABORT = 1.5;

export async function runPipeline(
  url: string,
  options: PipelineOptions = {},
): Promise<DecisionCard> {
  let warned = false;
  const tracker = newCostTracker((total) => {
    if (total > COST_ABORT) {
      options.onCostAbort?.(total);
      throw new CostCeilingError(total);
    }
    if (!warned && total > COST_WARN) {
      warned = true;
      options.onCostWarning?.(total);
    }
  });

  const progress = (stage: PipelineStage) => {
    options.onProgress?.(stage, tracker.total);
  };

  progress('transcript');
  const bundle = await fetchVideoBundle(url, { debug: options.debug === true });

  progress('normalize');
  const normalized = await normalizeTranscript(bundle, tracker);

  progress('extract');
  const extraction = await extractAnalysis({ bundle: normalized, tracker });

  progress('financials');
  const ticker = extraction.ticker.toUpperCase();
  const [snapshot, peerSnapshots] = await Promise.all([
    fetchFinancialSnapshot(ticker),
    fetchPeerSnapshots(getPeers(ticker)),
  ]);

  progress('critique');
  const critiques = await runCritiques({
    extraction,
    snapshot,
    peers: peerSnapshots,
    tracker,
  });

  progress('score');
  const scored = await scoreAnalysis({
    extraction,
    snapshot,
    critiques,
    tracker,
  });

  progress('done');

  return {
    videoId: bundle.videoId,
    ticker,
    channelId: bundle.channelId,
    generatedAt: new Date().toISOString(),
    extraction,
    critiques,
    scored,
    financialSnapshot: snapshot,
  };
}
