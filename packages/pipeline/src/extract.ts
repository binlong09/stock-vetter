import { ExtractedAnalysis, type VideoBundle } from '@stock-vetter/schema';
import { llmCallJson, type CostTracker } from './llm.js';
import { loadPrompt } from './prompts.js';
import { formatTranscriptForLLM } from './transcript-format.js';

export async function extractAnalysis(opts: {
  bundle: VideoBundle;
  tickerHint?: string | null;
  tracker: CostTracker;
}): Promise<ExtractedAnalysis> {
  const system = await loadPrompt('extract');
  const transcript = formatTranscriptForLLM(opts.bundle.transcript);
  const userMessage = [
    'METADATA:',
    `ticker: ${opts.tickerHint ?? '(infer from transcript)'}`,
    `title: ${opts.bundle.title}`,
    `channel: ${opts.bundle.channel}`,
    `publishedAt: ${opts.bundle.publishedAt}`,
    `durationSeconds: ${opts.bundle.durationSeconds}`,
    '',
    'TRANSCRIPT:',
    transcript,
  ].join('\n');

  return llmCallJson({
    stage: 'extract',
    systemPrompt: system,
    userMessage,
    schema: ExtractedAnalysis,
    maxTokens: 8192,
    tracker: opts.tracker,
  });
}
