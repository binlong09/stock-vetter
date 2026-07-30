// Phase 4: cloud synthesis with local verification.
//
// The cloud model gets the ~5,000-token brief and two tools that read the
// LOCAL corpus. When it wants to check a figure, the retrieval happens on the
// machine with the disk and the GPU, and only the ~500-token answer crosses
// the network. Verifying a dozen figures costs a few thousand tokens instead
// of re-uploading a 300,000-token filing.
//
// The tools are deliberately two, not one, and they answer different
// questions. `search_filings` is ranked retrieval — it returns candidates to
// read. `verify_quote` is exact substring matching — it returns whether a
// citation is real. Collapsing them into one "search" tool is how a ranked
// near-miss ends up presented as a confirmed citation.

import {
  llmCallWithToolsJson,
  loadPrompt,
  type CostTracker,
  type LLMTool,
  type ToolCallRecord,
} from '@stock-vetter/core';
import { ShortAssessment, type FilingBrief } from '@stock-vetter/schema';
import type { LookbackIndex } from './lookback.js';
import { renderBriefMarkdown } from './brief.js';

export type SynthesisOptions = {
  model?: string;
  maxIterations?: number;
  maxTokens?: number;
  /** Passages returned per search. Default 4. */
  searchLimit?: number;
  /** Tokens per returned passage. Default 500. */
  snippetTokens?: number;
  onToolCall?: (record: ToolCallRecord) => void;
};

/**
 * Build the two verification tools over a lookback index.
 *
 * Exported so the tool surface can be tested, and reused, without standing up
 * a full synthesis run.
 */
export function buildVerificationTools(
  index: LookbackIndex,
  ctx: { ticker: string; accession: string },
  opts: { searchLimit?: number; snippetTokens?: number } = {},
): LLMTool[] {
  const searchLimit = opts.searchLimit ?? 4;
  const snippetTokens = opts.snippetTokens ?? 500;

  return [
    {
      name: 'search_filings',
      description:
        'Search the locally indexed filing text for a figure, line item, or topic and get back the ' +
        'passages where it appears, with surrounding context (table rows arrive with their header ' +
        'and units). Results are RANKED CANDIDATES — a result is a passage worth reading, not proof ' +
        `that your query is correct. Defaults to ${ctx.ticker} filing ${ctx.accession}; widen with ` +
        'the ticker/accession/since arguments to compare against prior filings.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'What to look for. Literal figures and line-item names work best ("accounts receivable net 1,204.5", ' +
              '"days sales outstanding"); plain questions also work.',
          },
          ticker: { type: 'string', description: `Defaults to ${ctx.ticker}. Pass "*" to search every company.` },
          accession: {
            type: 'string',
            description: `Defaults to ${ctx.accession}. Pass "*" to search all of this company's indexed filings, which is how you compare against prior years.`,
          },
          sectionId: {
            type: 'string',
            description: 'Optional: mda, financial-statements, risk-factors, quant-risk, business.',
          },
        },
        required: ['query'],
      },
      handler: async (input) => {
        const query = String(input.query ?? '').trim();
        if (!query) return 'Error: query is required.';
        const ticker = input.ticker === '*' ? undefined : ((input.ticker as string) ?? ctx.ticker);
        const accession = input.accession === '*' ? undefined : ((input.accession as string) ?? ctx.accession);
        const hits = await index.search(query, {
          ticker,
          accession,
          sectionId: input.sectionId as string | undefined,
          limit: searchLimit,
          snippetTokens,
        });
        if (!hits.length) {
          return (
            `No passages found for "${query}". This means the text is not in the indexed corpus — ` +
            `which may mean the filing does not discuss it, or that this section failed to parse. ` +
            `It is not evidence that the underlying fact is false.`
          );
        }
        return hits
          .map(
            (h, i) =>
              `[${i + 1}] ${h.ticker} ${h.form} ${h.filingDate} · ${h.sectionId} · chunk ${h.chunkIndex}` +
              ` · accession ${h.accession}` +
              (h.headings.length ? `\nunder: ${h.headings.join(' > ')}` : '') +
              (h.snippet.tableContextAdded ? '\n(table header and caption prepended for context)' : '') +
              `\n---\n${h.snippet.text}`,
          )
          .join('\n\n');
      },
    },
    {
      name: 'verify_quote',
      description:
        'Check whether an exact string appears verbatim in the indexed filing text. Use this before ' +
        'setting verified:true on any citation. Exact substring matching, not search: a paraphrase, ' +
        'a reworded sentence, or a quote stitched from two places returns not-found even when every ' +
        'individual word is present in the filing.',
      inputSchema: {
        type: 'object',
        properties: {
          quote: { type: 'string', description: 'The exact text to look for. At least 12 characters.' },
          ticker: { type: 'string', description: `Defaults to ${ctx.ticker}.` },
          accession: { type: 'string', description: `Defaults to ${ctx.accession}. Pass "*" to check all filings.` },
        },
        required: ['quote'],
      },
      handler: async (input) => {
        const quote = String(input.quote ?? '');
        if (quote.length < 12) return 'Not found: quote is too short to verify (needs at least 12 characters).';
        const r = await index.verifyQuote(quote, {
          ticker: input.ticker === '*' ? undefined : ((input.ticker as string) ?? ctx.ticker),
          accession: input.accession === '*' ? undefined : ((input.accession as string) ?? ctx.accession),
        });
        return r.found
          ? `VERIFIED: found verbatim in ${r.accession}, chunk ${r.chunkId}.`
          : 'NOT FOUND: this exact string does not appear in the indexed text. Do not cite it as verbatim. ' +
              'Use search_filings to find how the filing actually words it.';
      },
    },
  ];
}

export type SynthesisResult = {
  assessment: ShortAssessment;
  toolCalls: ToolCallRecord[];
  iterations: number;
};

/**
 * Run the cloud synthesis over one filing brief.
 *
 * The brief is marked as a cacheable prefix: when several filings for the same
 * company are synthesized in one run, or a run is retried, the system prompt
 * is a cache hit.
 */
export async function synthesizeShortAssessment(
  brief: FilingBrief,
  index: LookbackIndex,
  tracker: CostTracker,
  opts: SynthesisOptions = {},
): Promise<SynthesisResult> {
  const system = await loadPrompt('short-synthesis');
  const tools = buildVerificationTools(
    index,
    { ticker: brief.ticker, accession: brief.accession },
    { searchLimit: opts.searchLimit, snippetTokens: opts.snippetTokens },
  );

  const { value, toolCalls, iterations } = await llmCallWithToolsJson({
    stage: `short-synthesis-${brief.ticker}`,
    // The prompt is identical for every company in a run, so caching it turns
    // ~1,500 tokens of instructions into a cache read after the first filing.
    systemPrompt: [{ text: system, cache: true, ttl: '1h' }],
    userMessage: renderBriefMarkdown(brief),
    tools,
    schema: ShortAssessment,
    submitToolName: 'submit_assessment',
    submitToolDescription:
      'Record your final short-side assessment. Call this exactly once, after you have verified whatever ' +
      'figures the thesis depends on. Returning verdict "no-edge" is a complete and often correct answer.',
    maxIterations: opts.maxIterations ?? 12,
    maxTokens: opts.maxTokens ?? 8192,
    tracker,
    model: opts.model,
    onToolCall: opts.onToolCall,
  });

  return { assessment: value, toolCalls, iterations };
}

/** Render an assessment for the terminal or a fixture file. */
export function renderAssessmentMarkdown(brief: FilingBrief, r: SynthesisResult): string {
  const a = r.assessment;
  const L: string[] = [];
  L.push(`# ${brief.ticker} — ${a.verdict.toUpperCase()} (conviction ${a.conviction}/10)`);
  L.push(`${brief.form} filed ${brief.filingDate} · accession ${brief.accession}`);
  L.push('', '## Thesis', a.thesis);

  if (a.catalysts.length) {
    L.push('', '## Catalysts');
    for (const c of a.catalysts) L.push(`- **${c.expectedWindow}** — ${c.event}`);
  }

  if (a.evidence.length) {
    L.push('', '## Evidence');
    for (const e of a.evidence) {
      L.push(`- **[${e.severity}] ${e.category}** — ${e.point}`);
      L.push(`  - "${e.citation.quote}"`);
      L.push(
        `  - ${e.citation.accession} · ${e.citation.sectionId} · ` +
          (e.citation.verified ? '**verified against filing text**' : '_unverified_'),
      );
    }
  }

  L.push('', '## Bull case', a.bullCase);

  if (a.whatWouldKillThis.length) {
    L.push('', '## What would kill this');
    for (const x of a.whatWouldKillThis) L.push(`- ${x}`);
  }
  if (a.mechanicalRisks.length) {
    L.push('', '## Mechanical risks of the short');
    for (const x of a.mechanicalRisks) L.push(`- ${x}`);
  }
  if (a.unverifiedClaims.length) {
    L.push('', '## Could not verify');
    for (const x of a.unverifiedClaims) L.push(`- ${x}`);
  }

  const verified = a.evidence.filter((e) => e.citation.verified).length;
  L.push(
    '',
    `_${r.iterations} model turns · ${r.toolCalls.length} verification lookups · ` +
      `${verified}/${a.evidence.length} citations verified against filing text._`,
  );
  return L.join('\n');
}
