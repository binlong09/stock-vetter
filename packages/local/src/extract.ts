// Phase 2: per-chunk extraction on the local model, with a deterministic
// hallucination filter.
//
// The filter is the important part. A 30B-class local model reading a dense
// financial table will sometimes emit a figure that is not in the text — a
// plausible number, correctly formatted, attached to a real line item, wrong.
// Across 2,000 companies × ~40 chunks per filing that is not a rare event, and
// nothing about the output looks wrong.
//
// The prompt therefore requires a verbatim `quote` on every claim, and
// `verifyQuotes` mechanically checks each one against the chunk text it came
// from. A finding whose quote isn't there is dropped and counted. This does
// not catch every error — a real quote can be attached to a wrong
// interpretation — but it eliminates the fabricated-figure class entirely, and
// the drop count is a live quality signal: if it climbs, the model or the
// prompt has regressed, visibly, instead of quietly.

import { ChunkExtraction, type ChunkExtractionRecord } from '@stock-vetter/schema';
import { loadPrompt } from '@stock-vetter/core';
import type { FilingChunk } from './chunk.js';
import { chunkBodyOnly } from './chunk.js';
import { estimateTokens } from './tokens.js';
import type { OllamaClient } from './ollama.js';

// Quote matching is whitespace- and quote-mark-insensitive. Models normalize
// curly quotes to straight and collapse the runs of spaces that survive HTML
// rendering; neither is a hallucination and neither should cost a finding.
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export type QuoteCheck = { kept: number; dropped: number; droppedQuotes: string[] };

/**
 * Drop every metric, flag, and management claim whose quote does not appear in
 * `sourceText`. Returns the filtered extraction and a count.
 *
 * Very short quotes are rejected outright: a three-word quote will match
 * something in any filing by chance, which makes the check meaningless for
 * exactly the findings most likely to be invented.
 */
export function verifyQuotes(
  extraction: ChunkExtraction,
  sourceText: string,
  opts: { minQuoteChars?: number } = {},
): { extraction: ChunkExtraction; check: QuoteCheck } {
  const minChars = opts.minQuoteChars ?? 12;
  const haystack = normalizeForMatch(sourceText);
  const droppedQuotes: string[] = [];
  let kept = 0;

  const ok = (quote: string): boolean => {
    const q = normalizeForMatch(quote);
    if (q.length < minChars) {
      droppedQuotes.push(quote);
      return false;
    }
    if (haystack.includes(q)) {
      kept++;
      return true;
    }
    droppedQuotes.push(quote);
    return false;
  };

  const filtered: ChunkExtraction = {
    ...extraction,
    metrics: extraction.metrics.filter((m) => ok(m.quote)),
    flags: extraction.flags.filter((f) => ok(f.quote)),
    managementClaims: extraction.managementClaims.filter((c) => ok(c.quote)),
  };

  return {
    extraction: filtered,
    check: { kept, dropped: droppedQuotes.length, droppedQuotes },
  };
}

export type ExtractOptions = {
  /** Cap on the model's response length. Raise if extractions get truncated. */
  maxOutputTokens?: number;
  /** Called after each chunk, for progress reporting. */
  onChunk?: (chunkId: string, record: ChunkExtractionRecord | null, error?: Error) => void;
};

function buildPrompt(chunk: FilingChunk): string {
  return [
    `FILING: ${chunk.ticker} ${chunk.form} filed ${chunk.filingDate} (accession ${chunk.accession})`,
    `SECTION: ${chunk.sectionLabel}`,
    `CHUNK: ${chunk.index + 1} of ${chunk.total}`,
    chunk.isTableContinuation
      ? 'NOTE: this chunk contains part of a table that was split. Do not describe totals or trends spanning rows you cannot see.'
      : '',
    '',
    '--- CHUNK TEXT ---',
    chunk.text,
    '--- END CHUNK TEXT ---',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Extract one chunk. Returns null when the model failed after its retries —
 * a failed chunk is recorded and skipped, never silently treated as empty,
 * because "no findings" and "the model fell over" mean opposite things.
 */
export async function extractChunk(
  client: OllamaClient,
  chunk: FilingChunk,
  opts: ExtractOptions = {},
): Promise<ChunkExtractionRecord> {
  const system = await loadPrompt('local-chunk-extract');
  const prompt = buildPrompt(chunk);
  const maxOutputTokens = opts.maxOutputTokens ?? 3072;

  // Refuse rather than let Ollama truncate the front of the chunk silently.
  client.assertContextFits(estimateTokens(system) + estimateTokens(prompt), maxOutputTokens);

  const { value } = await client.generateJson({
    prompt,
    system,
    schema: ChunkExtraction,
    maxOutputTokens,
  });

  // Verify against the chunk's OWN material only. Quoting the overlap preamble
  // would attribute the previous chunk's content to this one and double-count
  // it during aggregation — the prompt forbids it, and this enforces it.
  const { extraction, check } = verifyQuotes(value, chunkBodyOnly(chunk));

  return {
    chunkId: chunk.id,
    ticker: chunk.ticker,
    accession: chunk.accession,
    sectionId: chunk.sectionId,
    chunkIndex: chunk.index,
    extraction,
    droppedForBadQuote: check.dropped,
  };
}

export type ExtractRunResult = {
  records: ChunkExtractionRecord[];
  failures: Array<{ chunkId: string; error: string }>;
};

/**
 * Extract a whole filing's chunks in order.
 *
 * Sequential by default because there is one GPU: issuing chunks in parallel
 * to a server with OLLAMA_NUM_PARALLEL=1 just moves the queue from here to
 * there while making failures harder to attribute. `OllamaClient` enforces
 * the real concurrency limit either way.
 */
export async function extractChunks(
  client: OllamaClient,
  chunks: FilingChunk[],
  opts: ExtractOptions = {},
): Promise<ExtractRunResult> {
  const records: ChunkExtractionRecord[] = [];
  const failures: Array<{ chunkId: string; error: string }> = [];

  for (const chunk of chunks) {
    try {
      const rec = await extractChunk(client, chunk, opts);
      records.push(rec);
      opts.onChunk?.(chunk.id, rec);
    } catch (e) {
      const err = e as Error;
      failures.push({ chunkId: chunk.id, error: err.message });
      opts.onChunk?.(chunk.id, null, err);
    }
  }

  return { records, failures };
}
