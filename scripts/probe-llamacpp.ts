#!/usr/bin/env tsx
/**
 * scripts/probe-llamacpp.ts  (TEMPORARY probe, not part of the product)
 *
 * Tier 2 runs on an Ollama-native API. The local box available for testing is
 * llama.cpp's llama-server (OpenAI-compatible), which the scanner's OllamaClient
 * cannot talk to. This probe reuses the REAL tier-1 prep, extraction system
 * prompt, ChunkExtraction schema, and verifyQuotes filter, but sends the request
 * over the OpenAI-compatible /v1/chat/completions endpoint — answering the one
 * question that matters: can this model actually do the extraction job, with
 * schema-valid, quote-faithful output?
 *
 *   pnpm tsx scripts/probe-llamacpp.ts CHD 10-K 5
 */
import 'dotenv/config';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ChunkExtraction } from '@stock-vetter/schema';
import { loadPrompt } from '@stock-vetter/core';
import {
  preparePeriodicFiling,
  chunkBodyOnly,
  verifyQuotes,
  estimateTokens,
  stripFence,
} from '@stock-vetter/local';

const HOST = process.env.LLAMACPP_HOST ?? 'http://100.113.66.64:8080';
const MODEL = process.env.LLAMACPP_MODEL ?? 'unsloth/Qwen3.6-27B-MTP-GGUF:UD-Q4_K_XL';

const ticker = process.argv[2] ?? 'CHD';
const form = (process.argv[3] ?? '10-K') as '10-K' | '10-Q';
const maxChunks = Number(process.argv[4] ?? 5);

function buildPrompt(chunk: any): string {
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

async function extractOne(system: string, jsonSchema: object, chunk: any) {
  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: buildPrompt(chunk) },
    ],
    temperature: 0,
    max_tokens: 8192,
    // Qwen3 is a reasoning model; left on, it spends the entire output budget in
    // the <think> block and emits no JSON. Extraction is transcription, not
    // reasoning, so thinking is disabled.
    chat_template_kwargs: { enable_thinking: false },
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'ChunkExtraction', schema: jsonSchema, strict: true },
    },
  };
  const started = Date.now();
  const res = await fetch(`${HOST}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000),
  });
  const ms = Date.now() - started;
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json: any = await res.json();
  const content: string = json.choices?.[0]?.message?.content ?? '';
  const usage = json.usage ?? {};
  return { content, ms, usage, finish: json.choices?.[0]?.finish_reason };
}

async function main(): Promise<void> {
  process.stdout.write(`Probing ${HOST}\n  model: ${MODEL}\n\n`);
  process.stdout.write(`Preparing ${ticker} ${form} from EDGAR (tier 1)…\n`);
  const prepared = await preparePeriodicFiling(ticker, form, {});
  process.stdout.write(
    `  ${prepared.chunks.length} chunks; warnings: ${prepared.warnings?.length ? prepared.warnings.join('; ') : 'none'}\n\n`,
  );

  const system = await loadPrompt('local-chunk-extract');
  const jsonSchema = zodToJsonSchema(ChunkExtraction, { $refStrategy: 'none', target: 'jsonSchema7' });

  // Prefer chunks that actually contain financial tables/figures — the case the
  // hallucination filter exists for.
  const ranked = [...prepared.chunks].sort(
    (a, b) => (b.text.match(/[|$]/g)?.length ?? 0) - (a.text.match(/[|$]/g)?.length ?? 0),
  );
  const sample = ranked.slice(0, maxChunks);

  let totKept = 0;
  let totDropped = 0;
  let schemaFails = 0;
  let totOut = 0;
  let totMs = 0;

  for (const chunk of sample) {
    const promptTokens = estimateTokens(system) + estimateTokens(buildPrompt(chunk));
    process.stdout.write(
      `── chunk ${chunk.index + 1}/${chunk.total} · ${chunk.sectionLabel} · ~${promptTokens} prompt tok\n`,
    );
    try {
      const { content, ms, usage, finish } = await extractOne(system, jsonSchema, chunk);
      totMs += ms;
      totOut += usage.completion_tokens ?? 0;
      const tps = usage.completion_tokens && ms ? ((usage.completion_tokens / ms) * 1000).toFixed(1) : '?';
      let parsed: unknown;
      try {
        parsed = JSON.parse(stripFence(content));
      } catch (e) {
        schemaFails++;
        process.stdout.write(`   ✗ output not JSON (${(e as Error).message}); began: ${content.slice(0, 120)}\n\n`);
        continue;
      }
      const check = ChunkExtraction.safeParse(parsed);
      if (!check.success) {
        schemaFails++;
        process.stdout.write(`   ✗ schema-invalid: ${check.error.issues.map((i) => i.path.join('.')).join(', ')}\n\n`);
        continue;
      }
      const { extraction, check: qc } = verifyQuotes(check.data, chunkBodyOnly(chunk));
      totKept += qc.kept;
      totDropped += qc.dropped;
      process.stdout.write(
        `   ✓ schema-valid · ${finish} · ${usage.completion_tokens ?? '?'} out tok · ${tps} tok/s\n` +
          `   findings: ${extraction.metrics.length} metrics, ${extraction.flags.length} flags, ` +
          `${extraction.managementClaims.length} claims · quotes kept ${qc.kept} / dropped ${qc.dropped}\n`,
      );
      const showFlag = extraction.flags[0];
      const showMetric = extraction.metrics[0];
      if (showFlag) process.stdout.write(`     flag: [${showFlag.severity}] ${showFlag.category} — "${showFlag.quote.slice(0, 90)}"\n`);
      if (showMetric) process.stdout.write(`     metric: ${showMetric.label}=${showMetric.value ?? '?'} — "${showMetric.quote.slice(0, 80)}"\n`);
      for (const dq of qc.droppedQuotes)
        process.stdout.write(`     DROPPED: "${dq.slice(0, 110)}"\n`);
      process.stdout.write('\n');
    } catch (e) {
      process.stdout.write(`   ✗ request failed: ${(e as Error).message}\n\n`);
    }
  }

  const dropRate = totKept + totDropped > 0 ? ((totDropped / (totKept + totDropped)) * 100).toFixed(1) : '0';
  const tps = totOut && totMs ? ((totOut / totMs) * 1000).toFixed(1) : '?';
  process.stdout.write(
    `─────────────────────────────────────────\n` +
      `${sample.length} chunks · ${schemaFails} schema failures · ${totOut} out tok · ${tps} tok/s\n` +
      `quotes kept ${totKept} / dropped ${totDropped} (drop rate ${dropRate}% — the hallucination signal)\n`,
  );
}

main().catch((e) => {
  process.stderr.write(`${(e as Error).stack ?? e}\n`);
  process.exit(1);
});
