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
import { MispricingAssessment, type FilingBrief } from '@stock-vetter/schema';
import type { LookbackIndex } from './lookback.js';
import { renderBriefMarkdown } from './brief.js';
import { computeRatios, type PeriodRatios } from './ratios.js';
import type { SeriesSet, MarketSnapshot } from '@stock-vetter/core';

export type SynthesisOptions = {
  /**
   * The company's XBRL series, if available. Supplying it adds the
   * `get_metric_history` tool, which lets the model read the actual numbers
   * behind a trend claim rather than taking the claim's word for it.
   */
  series?: SeriesSet | null;
  /** Period end of the filing under analysis — caps the history at as-of. */
  asOf?: string;
  /**
   * Current market context, fetched at analysis time. The verdict is a claim
   * about the price, so the price goes in the prompt; without it the model
   * either ignores requirement 4 (non-consensus) or answers it from stale
   * training-data memory. null/undefined renders an explicit "no market data"
   * note so the model knows to say when a judgment assumes a price.
   */
  market?: MarketSnapshot | null;
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
  opts: { searchLimit?: number; snippetTokens?: number; series?: SeriesSet | null; asOf?: string } = {},
): LLMTool[] {
  const searchLimit = opts.searchLimit ?? 4;
  const snippetTokens = opts.snippetTokens ?? 500;

  const tools: LLMTool[] = [
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

  if (opts.series) {
    // Only offered when there is a series to read. A tool that always returns
    // "no data" trains the model to stop calling it, including on the
    // companies where it would have worked.
    const rows = computeRatios(opts.series, { asOf: opts.asOf, quarters: 13 });
    tools.push({
      name: 'get_metric_history',
      description:
        'Return the quarterly history of a computed financial metric for this company, straight from ' +
        'its XBRL filings. Use this to check a trend claim in the brief against the actual numbers, ' +
        'to see whether a move is new or long-running, and to judge magnitude. These values are exact ' +
        '— arithmetic on figures the filer tagged itself, with no model in between. ' +
        `Available metrics: ${METRIC_KEYS.join(', ')}.`,
      inputSchema: {
        type: 'object',
        properties: {
          metric: { type: 'string', description: `One of: ${METRIC_KEYS.join(', ')}` },
          quarters: { type: 'number', description: 'How many recent quarters to return. Default 12.' },
        },
        required: ['metric'],
      },
      handler: async (input) => {
        const metric = String(input.metric ?? '') as keyof PeriodRatios;
        if (!METRIC_KEYS.includes(metric as (typeof METRIC_KEYS)[number])) {
          return `Unknown metric "${metric}". Available: ${METRIC_KEYS.join(', ')}`;
        }
        const n = Math.min(Number(input.quarters ?? 12) || 12, 13);
        const slice = rows.slice(-n);
        const values = slice
          .map((r) => {
            const v = r[metric];
            return typeof v === 'number' && Number.isFinite(v)
              ? `${r.period}: ${Number(v.toFixed(3))}`
              : `${r.period}: n/a`;
          })
          .join('\n');
        if (!slice.length) return `No history available for ${metric}.`;
        return (
          `${metric} — quarterly, oldest first (values are exact, computed from XBRL):\n${values}\n\n` +
          `Compare each period against the SAME fiscal quarter one year earlier. Sequential ` +
          `comparison is misleading for any seasonal business. (No concrete periods are named ` +
          `here on purpose — everything above the blank line is data, everything below is not.)`
        );
      },
    });
  }

  return tools;
}

// The numeric fields of PeriodRatios that are worth exposing. Listed rather
// than derived so adding a field to the ratio type doesn't silently widen the
// tool's surface.
const METRIC_KEYS = [
  'dso',
  'dio',
  'dpo',
  'ccc',
  'grossMargin',
  'operatingMargin',
  'cfoToNetIncome',
  'accrualRatio',
  'sgaToRevenue',
  'capexToDepreciation',
  'netDebtToAssets',
  'goodwillToAssets',
  'revenue',
  'costOfRevenue',
  'netIncome',
  'cfo',
  'accountsReceivable',
  'inventory',
  'accountsPayable',
  'deferredRevenue',
  'dilutedShares',
] as const;

const fmtUsd = (n: number): string =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${n.toFixed(2)}`;

/**
 * The market-context block appended to the brief. Exported for tests.
 *
 * When there is no snapshot the block still renders — saying so out loud —
 * because the failure mode it guards against is silent: a model with no price
 * and no admission of that fills the gap from training-data memory, which for
 * a small cap is stale by definition.
 */
export function renderMarketSnapshot(m: MarketSnapshot | null | undefined): string {
  const lines = ['## Market snapshot (fetched at analysis time — this is CURRENT data, not as-of-filing)'];
  if (!m || m.price == null) {
    lines.push(
      'No market data is available for this run. You do not know the current price. ' +
        'Do not fill the gap from memory — any judgment that something is "already priced in" ' +
        'is an assumption here, and must be listed in `unverifiedClaims`.',
    );
    return lines.join('\n');
  }
  lines.push(`- Price: $${m.price.toFixed(2)}`);
  if (m.marketCap != null) lines.push(`- Market cap: ${fmtUsd(m.marketCap)}`);
  if (m.fiftyTwoWeekHigh != null && m.fiftyTwoWeekLow != null) {
    const offHigh = ((m.fiftyTwoWeekHigh - m.price) / m.fiftyTwoWeekHigh) * 100;
    lines.push(
      `- 52-week range: $${m.fiftyTwoWeekLow.toFixed(2)}–$${m.fiftyTwoWeekHigh.toFixed(2)} ` +
        `(currently ${offHigh.toFixed(0)}% below the high)`,
    );
  }
  if (m.avgDollarVolume != null) lines.push(`- Average daily dollar volume: ${fmtUsd(m.avgDollarVolume)}`);
  lines.push(`- Fetched: ${m.fetchedAt}`);
  return lines.join('\n');
}

export type SynthesisResult = {
  assessment: MispricingAssessment;
  toolCalls: ToolCallRecord[];
  iterations: number;
  /**
   * The full agent conversation (brief+snapshot user turn through the final
   * submit), plus the system prompt it ran under. This is fine-tuning data:
   * a local model learns the verification PROCESS from these trajectories,
   * not just the shape of the answer.
   */
  transcript: { system: string; messages: unknown[] };
};

/**
 * Run the cloud synthesis over one filing brief.
 *
 * The brief is marked as a cacheable prefix: when several filings for the same
 * company are synthesized in one run, or a run is retried, the system prompt
 * is a cache hit.
 */
export async function synthesizeAssessment(
  brief: FilingBrief,
  index: LookbackIndex,
  tracker: CostTracker,
  opts: SynthesisOptions = {},
): Promise<SynthesisResult> {
  const system = await loadPrompt('synthesis');
  const tools = buildVerificationTools(
    index,
    { ticker: brief.ticker, accession: brief.accession },
    {
      searchLimit: opts.searchLimit,
      snippetTokens: opts.snippetTokens,
      series: opts.series,
      asOf: opts.asOf,
    },
  );

  const { value, toolCalls, iterations, transcript } = await llmCallWithToolsJson({
    stage: `synthesis-${brief.ticker}`,
    // The prompt is identical for every company in a run, so caching it turns
    // ~1,500 tokens of instructions into a cache read after the first filing.
    systemPrompt: [{ text: system, cache: true, ttl: '1h' }],
    userMessage: `${renderBriefMarkdown(brief)}\n\n${renderMarketSnapshot(opts.market)}`,
    tools,
    schema: MispricingAssessment,
    submitToolName: 'submit_assessment',
    submitToolDescription:
      'Record your final mispricing assessment (long, short, or no-edge). Call this exactly once, after you ' +
      'have verified whatever figures the thesis depends on. Returning verdict "no-edge" is a complete and often correct answer.',
    // 16, not 12: a first live batch of dense small-cap 10-Qs blew the
    // 12-iteration budget on ~1 in 4 escalations. Marginal iterations are
    // cheap (the conversation prefix is cached); a burned synthesis is not.
    maxIterations: opts.maxIterations ?? 16,
    maxTokens: opts.maxTokens ?? 8192,
    tracker,
    model: opts.model,
    onToolCall: opts.onToolCall,
  });

  return {
    assessment: value,
    toolCalls,
    iterations,
    transcript: { system, messages: transcript },
  };
}

/** Render an assessment for the terminal or a fixture file. */
export function renderAssessmentMarkdown(
  brief: FilingBrief,
  // The transcript isn't rendered, so callers that only carry the result
  // fields (scan.ts persists them without the conversation) stay valid.
  r: Omit<SynthesisResult, 'transcript'>,
): string {
  const a = r.assessment;
  const L: string[] = [];
  L.push(
    `# ${brief.ticker} — ${a.verdict.toUpperCase()}` +
      (a.direction !== 'none' ? ` (${a.direction})` : '') +
      ` (conviction ${a.conviction}/10)`,
  );
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

  L.push('', '## The other side', a.counterThesis);

  if (a.whatWouldKillThis.length) {
    L.push('', '## What would kill this');
    for (const x of a.whatWouldKillThis) L.push(`- ${x}`);
  }
  if (a.executionRisks.length) {
    L.push('', '## Execution risks');
    for (const x of a.executionRisks) L.push(`- ${x}`);
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
