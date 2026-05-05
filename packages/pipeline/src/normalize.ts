import type { VideoBundle } from '@stock-vetter/schema';
import { llmCall, type CostTracker } from './llm.js';
import { loadPrompt } from './prompts.js';
import { formatTranscriptForLLM, reparseTranscript } from './transcript-format.js';

/**
 * Heuristic for whether a transcript was manually uploaded (vs auto-captioned).
 * Manually-uploaded transcripts have normal punctuation density and casing;
 * auto-captions tend to be all-lowercase or have very sparse punctuation.
 */
export function looksManuallyUploaded(bundle: VideoBundle): boolean {
  const text = bundle.transcript.map((c) => c.text).join(' ');
  if (!text) return false;
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < 200) return false;
  const punctuation = (text.match(/[.,;:!?]/g) ?? []).length;
  const punctRatio = punctuation / Math.max(words, 1);
  // Auto-captions hover around 0.01–0.02 punct/word; manual transcripts are usually >0.06.
  if (punctRatio < 0.04) return false;
  // Also expect mixed case
  const uppers = (text.match(/[A-Z]/g) ?? []).length;
  const letters = (text.match(/[A-Za-z]/g) ?? []).length;
  const upperRatio = uppers / Math.max(letters, 1);
  return upperRatio > 0.02;
}

export async function normalizeTranscript(
  bundle: VideoBundle,
  tracker: CostTracker,
): Promise<VideoBundle> {
  if (looksManuallyUploaded(bundle)) {
    return bundle;
  }
  const system = await loadPrompt('normalize');
  const formatted = formatTranscriptForLLM(bundle.transcript);
  const userMessage = [
    `TITLE: ${bundle.title}`,
    `CHANNEL: ${bundle.channel}`,
    `DESCRIPTION: ${bundle.description}`,
    `TAGS: ${bundle.tags.join(', ')}`,
    '',
    'TRANSCRIPT:',
    formatted,
  ].join('\n');

  const result = await llmCall({
    stage: 'normalize',
    systemPrompt: system,
    userMessage,
    maxTokens: 8192,
    tracker,
  });

  const cleaned = reparseTranscript(bundle.transcript, result.text);
  return { ...bundle, transcript: cleaned };
}
